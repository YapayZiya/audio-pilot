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
- **Framework**: React Native (Expo)
- **Harita**: OpenStreetMap (OSM) Overpass API + react-native-maps
- **Konum**: expo-location (High Accuracy GPS)
- **Ses**: expo-speech (TTS) + expo-av (Audio Focus)
- **Haptik**: expo-haptics
- **Depolama**: react-native-mmkv (Offline cache)

## Kurulum

### Gereksinimler
- Node.js 18+
- npm veya yarn
- Expo CLI
- iOS Simulator veya Android Emulator

### Adımlar
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

## Proje Yapısı
```
AudioPilot/
├── App.tsx                    # Ana uygulama girişi
├── src/
│   ├── screens/
│   │   ├── SplashScreen.tsx   # Yasal uyarı ekranı
│   │   ├── DriveScreen.tsx    # Ana sürüş ekranı
│   │   └── HeadDownScreen.tsx # Sadece ses ekranı
│   ├── components/
│   │   └── MinimalCockpit.tsx # Hız ve viraj göstergesi
│   ├── services/
│   │   ├── osmService.ts      # OpenStreetMap veri çekme
│   │   ├── curvatureService.ts# Viraj eğrilik hesaplama
│   │   ├── locationService.ts # Arka plan konum takibi
│   │   ├── audioService.ts    # TTS ve audio focus yönetimi
│   │   └── hapticService.ts   # Titreşim paternleri
│   ├── models/
│   │   └── types.ts           # TypeScript arayüzleri
│   └── utils/
│       └── constants.ts       # Uygulama sabitleri
└── assets/                    # Görsel kaynakları
```

## Lisans
MIT