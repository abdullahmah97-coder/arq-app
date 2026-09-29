// منبّه الصحيان في أرك: منبّه نظام حقيقي (يرن ويطلع على الشاشة المقفلة حتى لو التطبيق مقفل) بـ AlarmKit.
// AlarmKit موجود من iOS 26، فكل استدعاء محمي بـ canImport و #available، وعلى الأجهزة الأقدم
// الدوال ترجع «غير متوفر» والتطبيق يستخدم إشعار بصوت بدالها (من جهة JavaScript).
import ExpoModulesCore
import Foundation
#if canImport(AlarmKit)
import AlarmKit
import AppIntents
import SwiftUI
#endif

/// خيارات الجدولة من JavaScript
struct ArqAlarmOptions: Record {
  @Field var id: String = ""
  /// منبّه يتكرر: الساعة والدقيقة والأيام (١ = الأحد … ٧ = السبت)
  @Field var hour: Int = 7
  @Field var minute: Int = 0
  @Field var weekdays: [Int] = []
  /// منبّه مرة وحدة (بالمللي ثانية). صفر = يتكرر حسب الأيام
  @Field var fireAtMs: Double = 0
  @Field var title: String = "ARQ"
  @Field var stopLabel: String = "Stop"
  @Field var openLabel: String = "Open ARQ"
  @Field var tint: String = "#F1551D"
}

public class ArqAlarmModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ArqAlarm")

    /// هل الجهاز يدعم المنبّه الحقيقي (iOS 26+)
    Function("isAvailable") { () -> Bool in
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) {
        return true
      }
      #endif
      return false
    }

    Function("authorizationStatus") { () -> String in
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) {
        return ArqAlarmModule.describe(AlarmManager.shared.authorizationState)
      }
      #endif
      return "unavailable"
    }

    AsyncFunction("requestAuthorization") { () async throws -> String in
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) {
        let state = try await AlarmManager.shared.requestAuthorization()
        return ArqAlarmModule.describe(state)
      }
      #endif
      return "unavailable"
    }

    /// يجدول المنبّه (ويستبدل أي منبّه بنفس المعرّف). يرجع false لو الجهاز ما يدعمه
    AsyncFunction("schedule") { (options: ArqAlarmOptions) async throws -> Bool in
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) {
        guard let uuid = UUID(uuidString: options.id) else {
          return false
        }
        try? AlarmManager.shared.cancel(id: uuid)

        let schedule: Alarm.Schedule
        if options.fireAtMs > 0 {
          schedule = .fixed(Date(timeIntervalSince1970: options.fireAtMs / 1000))
        } else {
          let days: [Locale.Weekday] = Array(Set(options.weekdays.compactMap { ArqAlarmModule.weekday($0) }))
          if days.isEmpty {
            return false
          }
          let time = Alarm.Schedule.Relative.Time(hour: options.hour, minute: options.minute)
          let recurrence = Alarm.Schedule.Relative.Recurrence.weekly(days)
          schedule = Alarm.Schedule.relative(Alarm.Schedule.Relative(time: time, repeats: recurrence))
        }

        // زر «إيقاف» وزر «افتح أرك» (يفتح التطبيق على يومك). ما نستخدم الغفوة بالعدّ التنازلي
        // لأنها تحتاج نشاط مباشر (Live Activity) في إضافة ويدجت، وبدونها ممكن ما ترجع ترن
        let stopButton = AlarmButton(
          text: LocalizedStringResource(stringLiteral: options.stopLabel),
          textColor: Color.white,
          systemImageName: "stop.circle"
        )
        let openButton = AlarmButton(
          text: LocalizedStringResource(stringLiteral: options.openLabel),
          textColor: Color.white,
          systemImageName: "sun.max"
        )
        let alert = AlarmPresentation.Alert(
          title: LocalizedStringResource(stringLiteral: options.title),
          stopButton: stopButton,
          secondaryButton: openButton,
          secondaryButtonBehavior: .custom
        )
        let attributes = AlarmAttributes<ArqAlarmMetadata>(
          presentation: AlarmPresentation(alert: alert),
          metadata: ArqAlarmMetadata(),
          tintColor: ArqAlarmModule.color(options.tint)
        )
        let configuration = AlarmManager.AlarmConfiguration.alarm(
          schedule: schedule,
          attributes: attributes,
          stopIntent: nil,
          secondaryIntent: ArqAlarmOpenIntent(),
          sound: .default
        )
        _ = try await AlarmManager.shared.schedule(id: uuid, configuration: configuration)
        return true
      }
      #endif
      return false
    }

    Function("cancel") { (id: String) in
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) {
        if let uuid = UUID(uuidString: id) {
          try? AlarmManager.shared.cancel(id: uuid)
        }
      }
      #endif
    }

    /// معرّفات المنبّهات المجدولة من التطبيق (للتأكد إن المنبّه فعلاً مضبوط)
    Function("scheduledIds") { () -> [String] in
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) {
        let alarms = (try? AlarmManager.shared.alarms) ?? []
        return alarms.map { $0.id.uuidString }
      }
      #endif
      return []
    }
  }

  #if canImport(AlarmKit)
  @available(iOS 26.0, *)
  static func describe(_ state: AlarmManager.AuthorizationState) -> String {
    switch state {
    case .authorized:
      return "authorized"
    case .denied:
      return "denied"
    case .notDetermined:
      return "notDetermined"
    @unknown default:
      return "notDetermined"
    }
  }

  @available(iOS 26.0, *)
  static func weekday(_ day: Int) -> Locale.Weekday? {
    switch day {
    case 1: return .sunday
    case 2: return .monday
    case 3: return .tuesday
    case 4: return .wednesday
    case 5: return .thursday
    case 6: return .friday
    case 7: return .saturday
    default: return nil
    }
  }

  static func color(_ hex: String) -> Color {
    let clean = hex.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "#", with: "")
    var rgb: UInt64 = 0
    Scanner(string: clean).scanHexInt64(&rgb)
    let r = Double((rgb & 0xFF0000) >> 16) / 255.0
    let g = Double((rgb & 0x00FF00) >> 8) / 255.0
    let b = Double(rgb & 0x0000FF) / 255.0
    return Color(red: r, green: g, blue: b)
  }
  #endif
}

#if canImport(AlarmKit)
@available(iOS 26.0, *)
struct ArqAlarmMetadata: AlarmMetadata {}

/// زر «افتح أرك» على شاشة المنبّه: يوقف المنبّه ويفتح التطبيق
@available(iOS 26.0, *)
struct ArqAlarmOpenIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Open ARQ"
  static var openAppWhenRun: Bool = true
  static var isDiscoverable: Bool = false

  init() {}

  func perform() async throws -> some IntentResult {
    return .result()
  }
}
#endif
