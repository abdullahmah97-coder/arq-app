// بطاقة أرك في Apple Wallet (.pkpass)
// - GET ?check=1        → { enabled } (التطبيق يسأل قبل ما يظهر الزر)
// - GET ?t=<رابط لمرة وحدة> → ملف البطاقة موقّع (Safari يفتح «أضف إلى Apple Wallet»)
// السر الوحيد: WALLET_KEY_PEM (المفتاح الخاص). الشهادة وشهادة Apple الوسيطة عامة ومضمّنة هنا.
// ينشر بدون التحقق من JWT لأن Safari يفتح الرابط بدون تسجيل دخول؛ الرابط نفسه قصير العمر ولمرة وحدة.
import forge from 'npm:node-forge@1.3.1';
import { zipSync } from 'npm:fflate@0.8.2';

const PASS_TYPE_ID = Deno.env.get('WALLET_PASS_TYPE_ID') ?? 'pass.sa.arq.app.membership';
const TEAM_ID = Deno.env.get('WALLET_TEAM_ID') ?? 'JZJV2KF8MV';

// شهادة البطاقة (عامة — تنرسل مع كل بطاقة). صالحة لين أكتوبر ٢٠٢٧؛ للتجديد ضع WALLET_CERT_PEM.
const PASS_CERT = `-----BEGIN CERTIFICATE-----
MIIGJzCCBQ+gAwIBAgIQAQeQMZss42schGPcMBAonDANBgkqhkiG9w0BAQsFADB1
MUQwQgYDVQQDDDtBcHBsZSBXb3JsZHdpZGUgRGV2ZWxvcGVyIFJlbGF0aW9ucyBD
ZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTELMAkGA1UECwwCRzQxEzARBgNVBAoMCkFw
cGxlIEluYy4xCzAJBgNVBAYTAlVTMB4XDTI2MDkyODIwMTcyNloXDTI3MTAyODIw
MTcyNVowgZ0xKjAoBgoJkiaJk/IsZAEBDBpwYXNzLnNhLmFycS5hcHAubWVtYmVy
c2hpcDExMC8GA1UEAwwoUGFzcyBUeXBlIElEOiBwYXNzLnNhLmFycS5hcHAubWVt
YmVyc2hpcDETMBEGA1UECwwKSlpKVjJLRjhNVjEaMBgGA1UECgwRQWJkdWxsYWgg
QWxodWRhaWYxCzAJBgNVBAYTAlNBMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIB
CgKCAQEAhebUHOCf2Yna8WqEsMy9ON28lgy9qtAMKrUxAk3h7+qtrkc5GAJc02Vg
Hldozipoh8T9wn+MV23+cOPoZQOZ0WTps0uV5IwVI0aHMYR3mFAWT/WLpSFuTdgD
OJqzH5nNzU65T3p7QHiDHHP2m40Pqc5BDHtYzkEIiCpGP6b+CJb7pgfruhCp27wC
WFPvXny9zmA54vdEbjW/sWICAWlhSLKGVbpbtYxwK2BJPjy6IfEtF5wiEVsDUsJb
jPXyk5IilKnyfd0P1jcj/Exc2ABz+fNU0qYpFK/0A0HAzJJbtevk/CGoLFP0Cr7Y
35u9PuFTyFGVY0vlBpiqrr+u1y8hSQIDAQABo4ICiDCCAoQwDAYDVR0TAQH/BAIw
ADAfBgNVHSMEGDAWgBRb2fod55oaC6OZdiJQhj6RyFt3qDBwBggrBgEFBQcBAQRk
MGIwLQYIKwYBBQUHMAKGIWh0dHA6Ly9jZXJ0cy5hcHBsZS5jb20vd3dkcmc0LmRl
cjAxBggrBgEFBQcwAYYlaHR0cDovL29jc3AuYXBwbGUuY29tL29jc3AwMy13d2Ry
ZzQwNDCCAR4GA1UdIASCARUwggERMIIBDQYJKoZIhvdjZAUBMIH/MIHDBggrBgEF
BQcCAjCBtgyBs1JlbGlhbmNlIG9uIHRoaXMgY2VydGlmaWNhdGUgYnkgYW55IHBh
cnR5IGFzc3VtZXMgYWNjZXB0YW5jZSBvZiB0aGUgdGhlbiBhcHBsaWNhYmxlIHN0
YW5kYXJkIHRlcm1zIGFuZCBjb25kaXRpb25zIG9mIHVzZSwgY2VydGlmaWNhdGUg
cG9saWN5IGFuZCBjZXJ0aWZpY2F0aW9uIHByYWN0aWNlIHN0YXRlbWVudHMuMDcG
CCsGAQUFBwIBFitodHRwczovL3d3dy5hcHBsZS5jb20vY2VydGlmaWNhdGVhdXRo
b3JpdHkvMB4GA1UdJQQXMBUGCCsGAQUFBwMCBgkqhkiG92NkBA4wMgYDVR0fBCsw
KTAnoCWgI4YhaHR0cDovL2NybC5hcHBsZS5jb20vd3dkcmc0LTkuY3JsMB0GA1Ud
DgQWBBQi6Jc1ObKtuKD0lgVPBhn4XIxbtzAOBgNVHQ8BAf8EBAMCB4AwKgYKKoZI
hvdjZAYBEAQcDBpwYXNzLnNhLmFycS5hcHAubWVtYmVyc2hpcDAQBgoqhkiG92Nk
BgMCBAIFADANBgkqhkiG9w0BAQsFAAOCAQEADMTfKhUQ2SDvKBRUInJyudAvipDm
q8UgnakFVksT3YYWq3cUG3ZUEZUvx/vfMdUXPvpfczZochrg0x48uBaZJ3VDkCm3
qzBzMKQRd0KLm5pyZL9BMUg/Fp+/iNdg+qP2FNCe6jnKvTvtQO4UaszDtcwXEcM3
xkAu3xJEtXg7HFa6kf52fpcv0oRcSucAGdGgWhLDgutYYG4Wj70YyOi+cwtBKHD1
3vSjHZuOIK5A1KTLW2xtmhNCyKhBIQvBIRr9zQglZdCt1IX70MACpAZN8rFmEyhc
ZDqxw/BYgA0YdoZYjGUJzovq7j6RO9y2xYezgaVYgCkY5+7aCZe5TCRKvw==
-----END CERTIFICATE-----`;
// Apple Worldwide Developer Relations — G4 (عامة)
const WWDR_G4 = `-----BEGIN CERTIFICATE-----
MIIEVTCCAz2gAwIBAgIUE9x3lVJx5T3GMujM/+Uh88zFztIwDQYJKoZIhvcNAQEL
BQAwYjELMAkGA1UEBhMCVVMxEzARBgNVBAoTCkFwcGxlIEluYy4xJjAkBgNVBAsT
HUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRYwFAYDVQQDEw1BcHBsZSBS
b290IENBMB4XDTIwMTIxNjE5MzYwNFoXDTMwMTIxMDAwMDAwMFowdTFEMEIGA1UE
Aww7QXBwbGUgV29ybGR3aWRlIERldmVsb3BlciBSZWxhdGlvbnMgQ2VydGlmaWNh
dGlvbiBBdXRob3JpdHkxCzAJBgNVBAsMAkc0MRMwEQYDVQQKDApBcHBsZSBJbmMu
MQswCQYDVQQGEwJVUzCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBANAf
eKp6JzKwRl/nF3bYoJ0OKY6tPTKlxGs3yeRBkWq3eXFdDDQEYHX3rkOPR8SGHgjo
v9Y5Ui8eZ/xx8YJtPH4GUnadLLzVQ+mxtLxAOnhRXVGhJeG+bJGdayFZGEHVD41t
QSo5SiHgkJ9OE0/QjJoyuNdqkh4laqQyziIZhQVg3AJK8lrrd3kCfcCXVGySjnYB
5kaP5eYq+6KwrRitbTOFOCOL6oqW7Z+uZk+jDEAnbZXQYojZQykn/e2kv1MukBVl
PNkuYmQzHWxq3Y4hqqRfFcYw7V/mjDaSlLfcOQIA+2SM1AyB8j/VNJeHdSbCb64D
YyEMe9QbsWLFApy9/a8CAwEAAaOB7zCB7DASBgNVHRMBAf8ECDAGAQH/AgEAMB8G
A1UdIwQYMBaAFCvQaUeUdgn+9GuNLkCm90dNfwheMEQGCCsGAQUFBwEBBDgwNjA0
BggrBgEFBQcwAYYoaHR0cDovL29jc3AuYXBwbGUuY29tL29jc3AwMy1hcHBsZXJv
b3RjYTAuBgNVHR8EJzAlMCOgIaAfhh1odHRwOi8vY3JsLmFwcGxlLmNvbS9yb290
LmNybDAdBgNVHQ4EFgQUW9n6HeeaGgujmXYiUIY+kchbd6gwDgYDVR0PAQH/BAQD
AgEGMBAGCiqGSIb3Y2QGAgEEAgUAMA0GCSqGSIb3DQEBCwUAA4IBAQA/Vj2e5bbD
eeZFIGi9v3OLLBKeAuOugCKMBB7DUshwgKj7zqew1UJEggOCTwb8O0kU+9h0UoWv
p50h5wESA5/NQFjQAde/MoMrU1goPO6cn1R2PWQnxn6NHThNLa6B5rmluJyJlPef
x4elUWY0GzlxOSTjh2fvpbFoe4zuPfeutnvi0v/fYcZqdUmVIkSoBPyUuAsuORFJ
EtHlgepZAE9bPFo22noicwkJac3AfOriJP6YRLj477JxPxpd1F1+M02cHSS+APCQ
A1iZQT0xWmJArzmoUUOSqwSonMJNsUvSq3xKX+udO7xPiEAGE/+QF4oIRynoYpgp
pU8RBWk6z/Kf
-----END CERTIFICATE-----`;

const IMAGES: Record<string, string> = {
  'icon.png': 'iVBORw0KGgoAAAANSUhEUgAAAB0AAAAdCAIAAADZ8fBYAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAGYktHRAD/AP8A/6C9p5MAAAAHdElNRQfqCRwUJhnQTjhaAAADE0lEQVRIx+3VTWhUVxQH8PM/980djTFmojMmMyQ4NFJaYxGULoptERoKBYVSlS4ikeJCpV06JV/OiMGPbVCpLUYtBrqQumt1Ie0mQqmCoQ1SrdZUqZjEyZczybx33z1djM5oHM20Viilb3Xhcn7vcO4992BiUz29gI9fBPq/+xyuyD/miggRiIgIZalETjkoWImXIxECEAiK9QE8V74iAuVIdgq1DbrjKMfikp2EcmSuavAcKCvJTGBpvd7Vo9Y0B3b1IBqX+xNgJSJE8pddEYFS4nscf0V391GwIpdqIVa6u48bm8R4UOoZSfNTUWYxhsZGsbiOJu95B7bb/rPe/p2UvotwlMZHxZiHWZfnPqjpdAaRmLOtQ8ZH/Mv99tZ1qqq2t6/7AxckPex81M61DZKdelqtndLoTAahiP70EAUrZHzU2bgTS+q8w+2Bj/ep5s0mfVete1+9vcHdvUXuDWP+AvHNrBvilEaranSyFwtDua4WGfyRZrKBHd380gosbfB6Ev7XX/gD/XrvKZ084SZbZWzkSZofQ5llOoOqkE72oiaSS3zAdct47XvmzDHvSCfCUe/zlDl9lN94l+uXu4mNqFykU8cRWiLT92fVuugCEGMQCuuuYwhF3GSr/fUnNDbpxCFuet0/95Xb9qH/zSl+dbVOHMby1+yNQTfVSpXVencvFteKcQEu4RIryk6q5s2IxnNdLfa3KwjH/O/OyGRa7znJL6+yAxe4caXe86Vkp/zzpxGO2aGrblcLwjH1zibKTBEXNdW2YlEhY/INonH/2z65cgmV1QDJ2Ii9+L16a4N6cz1NjAQ+OUiAm9oqd4agg9DzZPi2vXqZWMnQLwjoQqegMIdEBICIJWOg54n1iajYxO2f8bKV9vdBd992+eMmKhaKb4gIrMSdIeWAOS/MzheAiAAMxxFrAQAQaxGcL+lh+/MPiNSZI51y6xoWVOVPP58HnMDD2OJ9wGNzU4Tye4XFnO9ZqZAn+qKw8eifAbE+HP3AmfVIlgqhct7fPF08EJQT8XfmW1nwv2du/jfdPwEsoIPtg549qwAAAABJRU5ErkJggg==',
  'icon@2x.png': 'iVBORw0KGgoAAAANSUhEUgAAADoAAAA6CAIAAABu2d1/AAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAGYktHRAD/AP8A/6C9p5MAAAAHdElNRQfqCRwUJhnQTjhaAAAG/UlEQVRo3u3Ze4xU1R0H8N/3PO7Mzu7szO4OEkhMTOoj0FCwgARoWndR2EohLoHyKCJS2EpTQ2tpcXlsYq31UaKm3QIxDV3jozFGW7UKAdmFyPJasFRpGq2rhUJiZR8z+5jZnXvP+fWPuewuRgZ2d6o0md9f9yb3nPuZ3/2dM+fci8Sia+n/J8SXDchzr57Ic/PcPDfPzXPz3C+Wy/zZg6uWy8wE+CcA51qscmtFhmg8IiKpMqfo/wEjjpxl12cB1NOpl/9Ur9pIqW4iAkQOc5yb7PZbubtT3bVe3vE9Aijd6+58BKEiQDDbnOQ4B9xB1oRa9hO1oJoTbcQs565ga736xxAK56oqRsq9YBXcHVdL16mFP+BEG0JFROBEm5q3kth6zzyOwmL0XzyCGFHt9o8t7upQi+9Ti9ZyvA3RmNn3srf7eURjHG9V81epu9ZzdyJTDyOs4xFl108VW7V0nVp4b7/V3fkrMgY6ICuXZcQEeC9tG2jyRWc3kyQh2RiES+SshWQMImWm4WV3Ry0CBSgMu7//pdn9AiJl5KVl+QKUXMOeR0IONB96yJqvRoZOvTC2kl2kHUp28XtHxKRv2GNvuU8/SE4QQhATtDbNDQhHUTba3bqOz7ZAO9zTBSdAw63jIXMHWbvlt+ZTvJX6knzuY5LKHtrF7Z+ioJCNIWIoRek+/uQ0pZKm4RUKBBEqktPn2JZTUHp4c8XQuP4NhOCuuJp3t/7RI2Lsdfb4fjnz23r1Ftw40b7zNvd0wnEAwX29KIroH2+V5VXc00XnPtZrf6EW30e9SXuyCYGCYcwVQ+H2Wzs71PxV6u4N3PGpuGEisVW3LUI4ikiZmDDNNjdwqofYIhjSG+rEDV8j44nrxlNRsZyzjM+fk1PKyRr714PDEF8xN7N2EZI7O9S8lWrlz7krjmiZafyTt/Nh/veHYmoFrEHpaDFhuj2yB4Cu2S6un8C9STC72zabPS8iWibGT+VEm5xSTsa1Jw8iGBqS+Mq4A9Z2+Z0V+p4HuCuO4lLz9l/c7VvgBPhsC390SsyohDWIjRE3TpTTZ4ubbubeJKRMP/Uze7wRoSJzbB9KRvniqeXkpu3JpiGJr4A72HrHcn3PRu6Oo7jUHHzD3baZ2EIqFBTymX9yy999celoxMZQug9Spp9cb5sbESkltmSNPXEAJdeI8ZM50S5vqaB0n/3bEMSX4w62Vi7T39/E3QkUl5qmN93fbECkVM1dYf9xgqxFYZjPfMAtp8T0SjCzMZAq/eR629yAaIw9l9y0qlrN/zlr9r+KUWPFuMnc2SGnVlBfyr576ArFWbmDrXOW6DVbfOvBN9zfbSKlAei1D4lrr7eHd5MQCIX5zAf84Sk5oxLaST9xf8ZKnkupHl1dK2+90+x6jojssQaUjhbjvs6dHfKWCupN2ncPZ8Q0eIE/BG6mGcCd7XL2Yr2mlnu6/LzWbSTtQAgSENNul9NmIVpmj+0jAKEw/+t9e/Yje6LRHt6DaIyMx6kevXqznLuCPjlt9r9K1kBpc3QvysZcEM/iZLd97wgCBZRVfOk1Q8bal5K3f1dX13KyC8UlpulNt66GlIaQbDxIhcIwxVvlrIUkpLujlokRLbMnDxIxomXsudSX0mu2yNlLON5KoSICyFpSmpygu6OWiGRFFSfa9coHiNnsfdEXD6MY2FoEQ3rd45AKoWJzaJdbV0NSQ0q2FlJybxLhEjFpJidaxbgpiI2xR98iEJwgtMPG861zlnK8FdFSs/cl+84BaIeshRAkpD26F7Gx4qZJlEqKr4y3B15j181SvtmXOExCUm+SwiXm0C63buOAlYiY4QS9Pz7lvfI0oqM4fl6WV+kfPkTpNBmPrKW+lK6ulbOXcMd5lIzyXqv3nv01KSezvuGM2Am622tN458pUkKpHoIgyrb6udwC0hqKxEzTLve3NaQuWJHRMgAUFnvPPUFEakE1x8/LW+8kCHfbJjJG3/ugvG1Rxmpef8arfwyhooGGF8TsBNzttaQdMXEGWZOdk3VmMBZFEQRD7s6HCYBS/VYi8tcoRAgE7fH9pB158zc5fl6Mm4xITE6aKSuXcty3uvWP+luMQVOV34MQJIRtbkQozKffp1QS4pLPHFm+/DAzpGQ3TQDkRdaLrunfVC6/P7NR82U9nYjGLrZeogch2BiyBjrA1mSp3UsXQ2ZjYwyk8kvt83oZyHHRoKpItBHzlVj9HvyRJ3zrMCey/geX9c/mc8RVqwkwr9e7fr0i+8a9n5jdSpcZaoNeHxFlv3CQ+NmtcAKkHfcPj6IwfFnrkO6FHH61HHjp5LlERMPdMmSJXL4jG8DpQGb6zK2Vcv4G0i++zFSfa2vuuRnyZw+uau7/MvLcPDfPzXPz3Dw3z/2S4r9Rg9Nd3KB+rAAAAABJRU5ErkJggg==',
  'icon@3x.png': 'iVBORw0KGgoAAAANSUhEUgAAAFcAAABXCAIAAAD+qk47AAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAGYktHRAD/AP8A/6C9p5MAAAAHdElNRQfqCRwUJhnQTjhaAAAKvklEQVR42u3bXXQU5RkH8Of/zrwz+5XdJCTyJYgCgnwTFBAjakWlx8vac+xt7YWtRCkkJIBe1F5UEE0CCafXbY9tT69atdragop6DiJSCR4JJkr84EtIstnsZndm5316MbPZBIOHTTZZz3Gei1xlzrzzm+ed93nemUX8p3PoBx+i1AP4XoSvQOQruOErEPkKbvgKRL6CG74Cka/ghq9A5Cu44SsQ+Qpu+ApEvoIbvgKRr+CGr0DkK7jhKxB9jxSYf6AKzEyA97eE4yihAjNDaGxbANjKQGhcunQojQIzQ9M5OSDmLDB++0exaDUP9kPXSwVRAoU8wbxFsr4F8xbLrc+L227nRMkgplphmABzFsrGdlRUc/9lhCKyoVUsWs2JeEkgplTBI0glcON8o6kN5VU8lIQ0OJNGMCwb9ouFK0oCMXUKeYJZ84ymdlTewOkkCY0dh4TgTBqhiNxxQCxYNvUQU6SQJ5h5k9F0ENNm8FCShAYAkRiEIIAzaYSjckebmL+UBwemEmIqFHIEg5gx12hqR9VMHhokCOiSs9nsn17gVAJmgECcGUJZTO44IOYtnkqISVfw6oLkAKbfaDS1o3p2jkAnpbK/fyb751a7bRenU5AmgTg9hGiFbGwTNy3iRNyrIybZQtu5NDapJwAEOzZmzjPqWzDzpjwBkdVSr97/L6pnc88Z7uoQ6x6AYZJyKJtFJCbWbOTOE9x3CZpOmNQxTsGMAMjO6I/8EvOXc6LfI2CymuvVscOIVbKVRrRcnXrf3vcUWxlIkwBODWDWzfqjT5FyJpuAJi8XmBkQBBAzCY0/OS5uWSxm3wLlEMFqcQkqOJsFwEohGOIvu72MkAaCYfX5J3b7LsoMAYIIbscBTArJpCh4z4KsTcqBJiEEJwfUB2+KxTWIVVkt9erYIcQqXQIiGgHRxd2nxLpNdOFL+/kn+ZtzMAMEsGOT40CXzGoyIIqvwMzQNE4nccNsRMq57xIME9LkeK/q6uBzn6k3/obqmWzbI6/HgwhH+cxHlBp0jrzM3R8jNo2YOZ1C1SxEK7j3Iswgq+JD6JNDMIRopbG9hUzTevYXfOUiGSaZAf0nj4vbarjnjOo8gbLy4Vyg4dV0oE8srtEfeZwvfW1/9Rmnh4gVyirkthcRLrOefYy/OYdghJ1scSGKmQt5grJy2XRQzFmAYERbfbc68TYNxmXd77TaH0PTxdr7+fQJPt+DYMi9sSObC7esxIy5YsEydfQNBMOyqU3MW4xAUKvZqD58m+NXYASKmxFFU/AI3LKnsV3csoRTCbItzJgj5i4S85dom3/GVy4SKwRCYu0mPn2cz3/hQbgEcxcaO9tRUc3pFKVTYsFyVE7X7nxIrKzl+BVyHFRUa6tq1Ydv8UBvcSGKs1LmCEaUwMk4QUCaNDTovP5S9t9/5bOdCEeJiS23ZWgTC1dwoh9GwCNoakd5NadTRIRQhM/3OK/8Ifv6Sxy/AjNIQK4Ab3cLcGhFqyyLkAt5glCZbDwgFi7nwThBQNNI0+22nc67r1OiT518T6u5B7FKsm1SWQRCYt393Pk/7j6FhcuNxrY8gRnkwbi9t051d/C5Hj7bqa1/AJpOzGRnUDldW7lBHX+TB/uLlRETVcgTBMOy8YC4deW3CF5DtBKGyb2X1EfvjoIIlolVtZRMyMd2o3o2DyXzBHu2qO5TiMRgBrinU/V0ausfzENUzdRWrFcfHObBeFEgJqTgEVgZBEKy8YBYtGo0wS7nnX+ivIqzNrGCGeTeS+qj97Q1GxGtJNsmJ4tASLtrM8wgW2mPIJkjKIuxkyVWCJXx2dOqp1O7MwdhpVE1Syxfr44d5uQADHOCEONXyBOYAdlwQCxeM4JA2m27nHdeRbTS3Uch5hzExREZkSEisjPETMxXE2SzRAShcSaFUBn3dKqzoyBE9SyxbJ06doiTCRjGRCDG+XT0qkMrA8OU9a3itjU82J8naN/pvPcaSVOsvltbez/Hr7jtEztZhMr43FnruV/x5fMIRkg5EBopBTPAybi9p051jSDQdR7oFSvvEms3kTTUiSNWcz2xgq4ThLdz2diGsnJOD0Eb/y72eBTym+jSkNtbxNI78gS6tNt3OUdeRWwa2RkKhuW2F0TNRh7ouxYE2xkEgpxM2HvqVFfHaIJ+seR2o6EV0QrKpBGbpj5402quJ+Y8xM1LZGMbIjHOjB+iYIVcj2BB1+X2ZrF8ndcpugRtu5wjryBaSU6WhCA7Q0KT214UNfeMDfHN16iYzol+e++WMQiWrZUN+8kMcWaIhCDHRqwiB0E5iLiYv1Q2tiEc5Ux6fBCFKQwTeNe2YsM1CYiIiYRGWRtCGNteEGvu5fhoiK8/t57fqk4ft5u3qzMnxyCob4UZICsNoRERETib9SBaRkAMxsWCZXLHAYQi44MoQIGZIQTbGXKvalUtJ/pGEOweReAdowjgrE2A8et94o77roa40GP95ueq+2NERhMsXycbWmGYbGVIiNxVMZCDOHbYaql3/9+DWLhCNuxHMMzpIeQPKbaC1/aZQWPrPlGz0SMQ7rNgt3Pk5TwBQAQiJmmQLomIs1kCjK37xNof5SGUA2lA0yENVk6OoE+sWC/rWyFNtjMEkKZDmsRMlGvDhyGaG0ZBLFot61sRrSi03SpkRgiNUglR+7BY/yDHez0CKe323c7bVxEQsSIzqD75kC98gWCEmDmbJZCxdZ+2bhPHe10Ib0OReQTBBlnfAmmwnSEmBEJ8+YI6dZTMILHK3w8P4pDV0kAEaDpB8ECvWLlB27CZUknyJlHRFdwRaBpZGSL6LgIiVgrS5K+67T1buP8yAiEPglk+tVdb/6AL4eYtM3sEK++S9S3QpUdgBjiVsPfWqc9OuTXiqMR0Id4/ZLU2EFwIkJUh5kI36QpfKZmJmIQgadgHnx6TwBulchAqUz1n7OeeyEM4OYg7HxqG8AhW1Rrbm6HrbFs5gkF7T5369CTCMVbOVUmehzj6H7t1hzt3iKZqpSShQZr2waedt/4xJkF+lE4W4aj64lsQSskn92gbNnO8F4bJA31i9d1yezNpOtv2CIIt6tOTbik95jzPQVQ6R9+wW3cAIE1nVtdxHRNRYIamkzTsg884b/0d0UpSzpgE1wHhyLrntNqH+VyPWHOvse1Fb6uS+WqC7Hc96kZCWPsbCQK6Uej7i0L6CICsjLh1pXPskPOvv6C8ipRDzPSdT+PhlYUvn+OOo+L2+xCJkXu1QojVd6Msqj9aBzPItlUowahThMLc1cFXLhAEd3XANK/fAgX9qpSZYZicGoRhui0QXd+ClP9mYe6tsqkd5VWcTpEQACgUoVSS2SE1HoJRpxCCrQwCwYIOpMJmBDPcd6oFEtC1poZymJkTcWY1QQL3FOTeJPfASaqavPciQhRKcG2IMCkHWq6nnADB8H1yb1Whwyvs6Zgf2bg6+TEggmG2LZjBIhCMHFWBh0/1Fz2jIPY8wb2XUFHt7TJOkGACUYKvu/IQZzvtfVtVV4fdvF11nigVARW6RhQxcls1GRIaOQ4M89vV4ZRFkd/QXX94Jba7JalpJSSg0n4BnF/PmEsGUHKFUVG6RPg+KZQ0fAUiX8ENX4HIV3DDVyDyFdzwFYh8BTd8BSJfwQ1fgchXcMNXIPIV3PAViHwFN3wFIl/BDV+BiOj/4qQkT+VeopoAAAAASUVORK5CYII=',
  'logo.png': 'iVBORw0KGgoAAAANSUhEUgAAAJYAAAAWCAYAAAAisWU6AAAEmklEQVR4nO2ZTXLbNhiGP8i1Ha8qj7Ovs1GX8Q1o36A3MHICKydofAL5BlROkPYEZk/QaFmlM84B4pG7svxH9P1gUgNC/AEoSLYTPTMYfvSABPDiEUXbgtasCYiaXHRv1H28FmtNMK4nXw5FmsZEYj+oWNPL8YAUHaAs8Op17wgHup2MD9IHGqD0RhF93HndG1LG9Nv4HAd/BI1e7fX6qH4Irr+NpSA6RqlRVo6huJn8+5tK008oR50O8ZhhuLkcx5i0pBKwkXqcR6PVOUpvFKnTnb1fP1AGJFY4eKMU/YVgD+kH4frynw+CxO8oNXaOodAPjZT+xgCJ2hCnesMXpU4qZi3W07FssbAPJzicoRXQG74ITVIxa7GejmWKxS/qU7o/QDmH3vC2VEg1QmPeommqxFL4vqeOGFIZqZK46BiVxg7EEmukOqKP4xwi5Xc+NUCpUWuxCjmGgN/jOkL8glKTdn76iL1rR5VU253Nw+nD3R9CUIRzTbVY1YtsCsQUS9XIMjdmTd/vkaYcQwCxEnO/8SE/0hvuS51UYvfNlT3QWqynoynHENj73UqsJqlQzw30VGLl7wCFMSv6vgSy37wk8uzj1ImmHENg77e3WBVSNYIg9Di2WD7YgTSJhcVKIfhvZuIUPXB8pKyvC9mmHmMt73G6crDeExzOfOcfSiz+kN6md4Otzub7/AGSg6wTZB2h1HiJ1VYqBpuhx1mVWFioFIJilHPYfV3IpDpH2cVChtt7vXeoVwbWeobDCSb/5/bGlrQ3to4QYrFUN+ndOcoDtM/4djoy54C8E+QdodQ4i7WIVMwqxbqeXOyL9O4CZSlmXxdMqdA0WMxK5Zpefulj5gOBcdPO5unO7puv5MiiYllS5RTkaiXWolIxqxSLwUKlCPDEKpMqBwtaqly8ofzVo6zsfebPLCIWz6FEKtwD/xba60nKQN4J8o5QahrFqpCq8KJehj1QjVgjtLdoJlf4X9PR1m7vM+pK6sRiMAeJOcQoC5T1LaNOqhwsamly8ZOX6B6tyAapq6ZsTNqK5SoVg6wTZB2h1NSK1VYqxh6oSixeJCnxFX1jnJo0ytUkFoN5yDb3dpEqBwtbmlwhaCOWj1QMck6Qc4RSUynWIlIx9kB1YvEi0V+if4wfmdQK4CIW0+bemVgJEf2MVouqCPu54CuWr1QMMk6QcYRSUyrWolIx9kBNYhHANRLXxChNKgVwFYvxvTfjIpeqCfu54CPW45rVJzyH98kA+b5DvkOqAPkmyDdCqZkTK4RUjD2Qi1gMrpO4LkZpUiqAKVYF9m8uzvfOeQy6XC5VI1XVp/45YGeek62V59xFm6EapGKQbYJsI5SaglihpGLsgVzFYnCtxLUxSpM5ARzEYpYil3qhUjFlmWdr5Dl30WYoB6kY5Jog1wilZiZWSKkYeyAfsRhcL3F9jNKkIICjWExQudQLloqxM8/WxnPuos1QjlIxyDRBphFKjRarQqr/sBn7+Wb4Yg/kKxaDe0jcI0ZpMhPAQywmlFwSa+njdI6XIBVjZs5/0hAPt2eKRBenJkNXqRjkmSDPCKWGxfofHhWSKFmYRr0AAAAASUVORK5CYII=',
  'logo@2x.png': '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',
  'logo@3x.png': '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',
};

export interface MembershipInfo { place: string | null; place_en: string | null; plan: string | null; ends_on: string | null; state: string }
export interface PassData {
  serial: string; code: string; member_name: string; username: string; member_since: string | null;
  memberships: MembershipInfo[]; locations: { lat: number; lng: number; name: string }[];
}

const STRINGS: Record<'ar' | 'en', Record<string, string>> = {
  ar: {
    MEMBER: 'العضو', CLUB: 'النادي', PLAN: 'الخطة', ENDS: 'ينتهي', SINCE: 'عضو منذ', STATUS: 'الحالة',
    ST_active: 'ساري', ST_frozen: 'مجمّد', ST_upcoming: 'يبدأ قريباً', ST_none: 'بدون اشتراك',
    NO_MEMBERSHIP: 'أضف اشتراكك من التطبيق', HOW: 'طريقة الدخول', HOW_V: 'اعرض الباركود على الاستقبال أو بوابة النادي.',
    UPDATE: 'تحديث البطاقة', UPDATE_V: 'لو تغيّر اشتراكك، نزّل البطاقة من جديد من التطبيق (اشتراكي). البطاقة الجديدة تلغي القديمة.',
    LOST: 'ضاع جوالك؟', LOST_V: 'أوقف البطاقة من التطبيق: اشتراكي ← بطاقة Wallet ← إيقاف.',
    GATE: 'البوابة', GATE_V: 'البوابة تقبل البطاقة مرة وحدة كل ٣ ساعات. للدخول مرة ثانية استخدم رمز الدخول المتجدد في التطبيق.',
    ALL: 'اشتراكاتي', NEAR: 'وصلت النادي؟ افتح بطاقتك',
  },
  en: {
    MEMBER: 'Member', CLUB: 'Club', PLAN: 'Plan', ENDS: 'Ends', SINCE: 'Member since', STATUS: 'Status',
    ST_active: 'Active', ST_frozen: 'Frozen', ST_upcoming: 'Starts soon', ST_none: 'No membership',
    NO_MEMBERSHIP: 'Add your membership in the app', HOW: 'How to enter', HOW_V: 'Show the barcode at reception or the club gate.',
    UPDATE: 'Updating the card', UPDATE_V: 'If your membership changes, add the card again from the app (My membership). The new card replaces the old one.',
    LOST: 'Lost your phone?', LOST_V: 'Turn the card off in the app: My membership → Wallet card → Turn off.',
    GATE: 'Gate', GATE_V: 'Gates accept this card once every 3 hours. To re-enter, use the rotating entry code in the app.',
    ALL: 'My memberships', NEAR: 'At the club? Open your card',
  },
};

const enc = new TextEncoder();
const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** يقبل المفتاح/الشهادة ملصوقة كسطر واحد (المسافات بدل الأسطر) أو فيها \n حرفياً */
export function normalizePem(raw: string): string {
  const s = raw.replace(/\\n/g, '\n').trim();
  const m = s.match(/-----BEGIN ([A-Z ]+)-----([\s\S]*?)-----END \1-----/);
  if (!m) throw new Error('bad_pem');
  const body = m[2].replace(/\s+/g, '');
  return `-----BEGIN ${m[1]}-----\n${body.match(/.{1,64}/g)!.join('\n')}\n-----END ${m[1]}-----\n`;
}

/** pass.strings بترميز UTF-16 مع BOM */
function stringsFile(d: Record<string, string>): Uint8Array {
  const txt = Object.entries(d).map(([k, v]) => `"${k}" = "${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}";`).join('\n') + '\n';
  const out = new Uint8Array(2 + txt.length * 2);
  out[0] = 0xff; out[1] = 0xfe;
  for (let i = 0; i < txt.length; i++) { const c = txt.charCodeAt(i); out[2 + i * 2] = c & 0xff; out[3 + i * 2] = c >> 8; }
  return out;
}

export function passJson(d: PassData) {
  const m = d.memberships.find((x) => x.state === 'active') ?? d.memberships[0];
  const date = (s: string) => `${s}T00:00:00+03:00`;
  const place = m?.place ?? null;
  return {
    formatVersion: 1,
    passTypeIdentifier: PASS_TYPE_ID,
    teamIdentifier: TEAM_ID,
    serialNumber: d.serial,
    organizationName: 'ARQ',
    description: 'ARQ membership card',
    sharingProhibited: true,
    backgroundColor: 'rgb(10, 51, 45)',
    foregroundColor: 'rgb(248, 237, 218)',
    labelColor: 'rgb(254, 169, 79)',
    barcodes: [{ format: 'PKBarcodeFormatQR', message: `arq://entry/${d.code}`, messageEncoding: 'iso-8859-1', altText: `ARQ · ${d.code.slice(-4).toUpperCase()}` }],
    locations: d.locations.slice(0, 10).map((l) => ({ latitude: Number(l.lat), longitude: Number(l.lng), relevantText: 'NEAR' })),
    generic: {
      headerFields: m?.ends_on
        ? [{ key: 'ends', label: 'ENDS', value: date(m.ends_on), dateStyle: 'PKDateStyleMedium', ignoresTimeZone: true }]
        : [{ key: 'status', label: 'STATUS', value: m ? `ST_${m.state}` : 'ST_none' }],
      primaryFields: [{ key: 'member', label: 'MEMBER', value: d.member_name }],
      secondaryFields: place
        ? [{ key: 'club', label: 'CLUB', value: place }, ...(m?.plan ? [{ key: 'plan', label: 'PLAN', value: m.plan }] : [])]
        : [{ key: 'club', label: 'CLUB', value: 'NO_MEMBERSHIP' }],
      auxiliaryFields: [
        ...(m ? [{ key: 'state', label: 'STATUS', value: `ST_${m.state}` }] : []),
        ...(d.member_since ? [{ key: 'since', label: 'SINCE', value: d.member_since.slice(0, 4) }] : []),
      ],
      backFields: [
        { key: 'how', label: 'HOW', value: 'HOW_V' },
        ...(d.memberships.length ? [{ key: 'all', label: 'ALL', value: d.memberships.map((x) => `${x.place ?? ''}${x.plan ? ` — ${x.plan}` : ''}${x.ends_on ? ` (${x.ends_on})` : ''}`).join('\n') }] : []),
        { key: 'update', label: 'UPDATE', value: 'UPDATE_V' },
        { key: 'gate', label: 'GATE', value: 'GATE_V' },
        { key: 'lost', label: 'LOST', value: 'LOST_V' },
        { key: 'user', label: 'MEMBER', value: `@${d.username}` },
      ],
    },
  };
}

/** يبني ملف .pkpass موقّع */
export async function buildPkpass(d: PassData, keyPem: string, certPem = PASS_CERT, wwdrPem = WWDR_G4): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = { 'pass.json': enc.encode(JSON.stringify(passJson(d))) };
  for (const [name, data] of Object.entries(IMAGES)) files[name] = b64(data);
  files['ar.lproj/pass.strings'] = stringsFile(STRINGS.ar);
  files['en.lproj/pass.strings'] = stringsFile(STRINGS.en);

  const manifest: Record<string, string> = {};
  for (const [name, data] of Object.entries(files)) manifest[name] = hex(await crypto.subtle.digest('SHA-1', data as Uint8Array<ArrayBuffer>));
  const manifestBytes = enc.encode(JSON.stringify(manifest));

  const key = forge.pki.privateKeyFromPem(normalizePem(keyPem));
  const cert = forge.pki.certificateFromPem(normalizePem(certPem));
  const wwdr = forge.pki.certificateFromPem(normalizePem(wwdrPem));
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(Array.from(manifestBytes, (b) => String.fromCharCode(b)).join(''));
  p7.addCertificate(cert);
  p7.addCertificate(wwdr);
  p7.addSigner({
    key, certificate: cert, digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() as unknown as string },
    ],
  });
  p7.sign({ detached: true });
  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  files['manifest.json'] = manifestBytes;
  files['signature'] = Uint8Array.from(der, (c: string) => c.charCodeAt(0));
  return zipSync(files, { level: 6 });
}

const page = (title: string, body: string, status: number) => new Response(
  `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ARQ</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;background:#0A332D;color:#F8EDDA;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px;text-align:center}h1{font-size:22px}p{color:#F7DFBB;line-height:1.7}a{color:#FEA94F}</style></head>
<body><div><h1>${title}</h1><p>${body}</p><p><a href="arq://membership">ارجع لتطبيق أرك</a></p></div></body></html>`,
  { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });

async function issue(token: string): Promise<{ data?: PassData; error?: string }> {
  const url = Deno.env.get('SUPABASE_URL')!;
  const srv = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const r = await fetch(`${url}/rest/v1/rpc/wallet_issue`, {
    method: 'POST', headers: { apikey: srv, Authorization: `Bearer ${srv}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_token: token }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) return { error: String(j?.message ?? 'error') };
  const row = Array.isArray(j) ? j[0] : j;
  return row ? { data: row as PassData } : { error: 'code_not_found' };
}

export async function handler(req: Request): Promise<Response> {
  const u = new URL(req.url);
  const keyPem = Deno.env.get('WALLET_KEY_PEM') ?? '';
  const enabled = keyPem.includes('PRIVATE KEY');
  if (u.searchParams.get('check')) {
    return new Response(JSON.stringify({ enabled }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  }
  if (!enabled) return page('بطاقة Wallet قريباً', 'نجهّز البطاقة حالياً. استخدم رمز الدخول في التطبيق لين تجهز.', 503);
  const token = u.searchParams.get('t') ?? '';
  if (!/^[0-9a-f]{64}$/.test(token)) return page('الرابط غير صحيح', 'ارجع للتطبيق واضغط «أضف إلى Apple Wallet» مرة ثانية.', 400);
  const { data, error } = await issue(token);
  if (!data) {
    const msg = error === 'code_expired' || error === 'code_used' ? 'الرابط انتهى أو انستخدم.' : 'ما قدرنا نجهز البطاقة.';
    return page(msg, 'ارجع للتطبيق واضغط «أضف إلى Apple Wallet» مرة ثانية.', 410);
  }
  try {
    const cert = Deno.env.get('WALLET_CERT_PEM') || PASS_CERT;
    const pkpass = await buildPkpass(data, keyPem, cert);
    return new Response(pkpass as Uint8Array<ArrayBuffer>, {
      headers: { 'Content-Type': 'application/vnd.apple.pkpass', 'Content-Disposition': 'attachment; filename="arq.pkpass"', 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    console.error('wallet-pass sign failed', e instanceof Error ? e.message : e);
    return page('ما قدرنا نجهز البطاقة', 'صار خطأ عندنا. جرب بعد شوي.', 500);
  }
}

if (import.meta.main) Deno.serve(handler);
