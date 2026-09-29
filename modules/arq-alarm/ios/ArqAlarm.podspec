# منبّه الصحيان في أرك (وحدة محلية): AlarmKit موجود من iOS 26 بس،
# فنربطه ربط «ضعيف» (weak) ونتحقق من الإصدار قبل كل استدعاء، والتطبيق يشتغل عادي على الأجهزة الأقدم.
Pod::Spec.new do |s|
  s.name           = 'ArqAlarm'
  s.version        = '1.0.0'
  s.summary        = 'ARQ wake-up alarm (AlarmKit on iOS 26+)'
  s.description    = 'Schedules real system alarms with AlarmKit on iOS 26 and later. Older iOS versions fall back to notifications in JavaScript.'
  s.author         = 'ARQ'
  s.homepage       = 'https://github.com/abdullahmah97-coder/arq-app'
  s.license        = { :type => 'Proprietary', :text => 'Part of the ARQ app.' }
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # iOS 26+ فقط: ربط ضعيف عشان التطبيق ما يطيح على iOS الأقدم
  s.weak_frameworks = 'AlarmKit', 'ActivityKit', 'AppIntents'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = '**/*.{h,m,swift}'
end
