# AudioPilot - The Invisible Co-Pilot
Görünmez Sürüş Asistanı - Audio-First Driving Safety Assistant

## Proje Hakkında
AudioPilot, sürücülerin telefona bakmalarını gerektirmeyen, tamamen sesli ve haptik geri bildirim ile çalışan bir sürüş güvenlik asistanıdır.

## Özellikler
- 🗺️ **Ücretsiz Harita**: OpenStreetMap tabanlı harita (Google Maps API yerine)
- 📍 **Arka Plan Konum**: Sürekli GPS takibi
- 🎙️ **Sesli Uyarılar**: Türkçe TTS motoru ile viraj uyarıları
- 📳 **Haptik Geri Bildirim**: Sol/sağ viraj titreşim paternleri
- 🧠 **Viraj Analizi**: OSM verilerinden eğrilik hesaplama
- 📴 **Çevrimdışı Mod**: Önbelleğe alınmış rota verisi ile çalışma
- 🚨 **Topluluk Bildirimleri**: Radar ve kaza bildirimleri

## Teknolojiler
- **Framework**: React Native (Expo SDK 51)
- **Harita**: OpenStreetMap (OSM) Overpass API + react-native-maps
- **Konum**: expo-location (High Accuracy GPS)
- **Ses**: expo-speech (TTS) + expo-av (Audio Focus / Ducking)
- **Haptik**: expo-haptics
- **Depolama**: react-native-mmkv (Offline cache)
- **CI/CD**: GitHub Actions + EAS Build

## Kurulum

### Gereksinimler
- Node.js 18+
- npm
- Expo CLI (`npm install -g expo-cli`)
- Expo hesabı (https://expo.dev)

### Yerel Geliştirme
```bash
# Bağımlılıkları yükle
npm install

# Uygulamayı başlat
npx expo start

# iOS için
npx expo run:ios

# Android için
npx expo run:android
```

### APK Build (CI/CD)
Proje, GitHub Actions ile otomatik APK build alır:
1. `main` branch'e her push'ta otomatik build tetiklenir
2. Veya GitHub Actions sekmesinden **Build Android APK** workflow'unu manuel çalıştırın
3. Build tamamlandığında APK EAS Dashboard üzerinden indirilebilir

**Gerekli Secrets:**
- GitHub Repository → Settings → Secrets and variables → Actions
- `EXPO_TOKEN`: Expo hesabı access token (https://expo.dev/accounts/YOUR_ACCOUNT/settings/access-tokens)

## Proje Yapısı
```
AudioPilot/
├── .github/
│   └── workflows/
│       └── build-apk.yml        # GitHub Actions CI/CD pipeline
├── assets/                      # Uygulama görselleri
├── src/
│   ├── components/
│   │   └── MinimalCockpit.tsx   # Hız ve viraj göstergesi komponenti
│   ├── models/
│   │   └── types.ts             # TypeScript arayüzleri (Turn, RoadSegment, Notification)
│   ├── screens/
│   │   ├── SplashScreen.tsx     # Yasal uyarı ekranı + Türkçe TTS
│   │   ├── DriveScreen.tsx      # Ana sürüş ekranı (kokpit UI)
│   │   └── HeadDownScreen.tsx   # Siyah ekran + sadece ses modu
│   ├── services/
│   │   ├── osmService.ts        # OpenStreetMap Overpass API veri çekme
│   │   ├── curvatureService.ts  # Viraj eğrilik hesaplama algoritması
│   │   ├── locationService.ts   # Arka plan konum takibi servisi
│   │   ├── audioService.ts      # TTS motoru + Audio Focus / Ducking yönetimi
│   │   └── hapticService.ts     # Titreşim paternleri yönetimi
│   └── utils/
│       └── constants.ts         # Uygulama sabitleri ve konfigürasyon
├── App.tsx                      # Ana uygulama girişi
├── app.json                     # Expo yapılandırma dosyası
├── eas.json                     # EAS Build profilleri
├── package.json                 # npm bağımlılıkları
├── tsconfig.json                # TypeScript yapılandırması
└── README.md                    # Proje dokümantasyonu
```

## Build Konfigürasyonu

### EAS Profiles (`eas.json`)
- **preview**: APK çıktısı, internal dağıtım için
- **production**: App Bundle (AAB) çıktısı, Google Play için

### Android Konfigürasyonu (`app.json`)
- Package: `com.audiopilot.app`
- İzinler: Konum, arka plan konum, ses kaydetme, audio ayarları
- Adaptive icon destekli

## Geliştirme Notları

### Viraj Analizi Algoritması
`CurvatureService` kullanarak OSM node koordinatlarından eğrilik hesaplanır:
1. Son 3 noktadan bearing açısı hesaplanır
2. Haversine formülü ile mesafe hesaplanır
3. Eğrilik yarıçapı (`curvature radius`) hesaplanır
4. `LOOKAHEAD_DISTANCE` (300m) içindeki virajlar sınıflandırılır

### Audio Focus Yönetimi
- Medya sesi çalıyorken uyarı anında `%30'a ducking` uygulanır
- `expo-av` ile `DuckOthers` modu kullanılır
- `expo-speech` ile Türkçe TTS sağlanır

### Head-Down Modu
- Ekran kapatılmadan siyah ekran + sadece ses modu
- `expo-keep-awake` ile ekran açık kalır
- Büyük butonlar ile ekrana bakmadan etkileşim

## Lisans
MIT
