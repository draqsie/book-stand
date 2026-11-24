# book-stand

iPad için sade ders çalışma uygulaması. Yerel bir iOS uygulaması değil; GitHub Pages'te yayımlanan ve
iPad'de Safari'den **Ana Ekran'a eklenen** bir PWA'dır (web uygulaması).

- Dersler → her derse bir veya daha fazla PDF kitap
- PDF üzerinde Apple Pencil veya parmakla yazma, vurgulama, silme, geri alma
- Her ders için ayrı dijital defter (boş, çizgili, kareli sayfa)
- Yanlış defteri: PDF'de soruyu seç → **Yanlış Defterine Ekle** (kırpılmış görüntü, kitap ve sayfa bilgisiyle)
- Kaldığın yer şeridi ve adlandırılmış ayraçlar
- Çözülen soru takibi ve gün sonu raporu (geçmiş günler dahil)
- Açık/koyu temalar (sabah/akşam), cihaz temasını izleme
- Çevrimdışı çalışma, otomatik ve güvenli güncelleme, .zip yedekleme

Derleme adımı yoktur: saf HTML, CSS ve JavaScript modülleri. PDF görüntüleme için PDF.js 4.10.38
(`vendor/pdfjs`, Apache-2.0 lisanslı) depoya gömülüdür; CDN'e bağlı değildir.

---

## 1. Bilgisayarda çalıştırma

Gerekli: [Node.js](https://nodejs.org) 18 veya üstü. Başka paket kurmak gerekmez.

```powershell
cd $HOME\OneDrive\Desktop\book-stand
```

```powershell
npm run dev
```

Tarayıcıda `http://localhost:5173/book-stand/` adresini açın. Yerel sunucu siteyi GitHub Pages'teki gibi
`/book-stand/` alt yolunda sunar.

Yayımlanacak sürümün aynısını (service worker önbelleği ve sürüm damgasıyla) denemek için:

```powershell
npm run preview
```

Yayın yapısını denetlemek için (GitHub Actions da aynı denetimi çalıştırır):

```powershell
npm run check
```

> Not: Yerelde (`npm run dev`) service worker her zaman ağdan en yeni dosyayı alır; böylece
> geliştirirken eski önbellek sorun çıkarmaz. Gerçek önbellekleme yalnızca yayımlanan sürümde etkindir.

## 2. GitHub'a gönderme (commit / push)

Bu adımları siz yaparsınız; uygulama veya bu proje sizin adınıza GitHub'a erişmez.

1. GitHub'da **book-stand** adında yeni ve boş bir depo oluşturun (README eklemeden).
2. Proje klasöründe:

```powershell
git init -b main
```

```powershell
git add .
```

```powershell
git commit -m "book-stand ilk sürüm"
```

```powershell
git remote add origin https://github.com/KULLANICI_ADINIZ/book-stand.git
```

```powershell
git push -u origin main
```

`.gitignore`, `node_modules`, `_site`, PDF dosyalarını ve yedek zip'lerini depodan dışarıda tutar.

## 3. GitHub Pages yayımlama

1. GitHub'da depo → **Settings → Pages**.
2. **Build and deployment → Source:** `GitHub Actions` seçin.
3. `main` dalına her push'ta **Actions** sekmesindeki “GitHub Pages'e yayımla” iş akışı çalışır:
   siteyi `_site` klasöründe hazırlar, yapıyı denetler ve yayımlar.
4. Adres: `https://KULLANICI_ADINIZ.github.io/book-stand/`

Tüm dosya yolları göreli (`./`) olduğundan uygulama depo alt yolunda (`/book-stand/`) çalışır; manifestteki
`start_url` ve `scope` de `./` olarak ayarlıdır.

### Yayın dalını değiştirme

Varsayılan dal `main`. Örneğin `yayin` dalından yayımlamak için:

1. `.github/workflows/pages.yml` içinde `branches: [main]` satırını `branches: [yayin]` yapın.
2. GitHub'da **Settings → Environments → github-pages → Deployment branches and tags** bölümüne
   `yayin` dalını ekleyin (GitHub varsayılan olarak yalnızca ana dala izin verir).
3. Değişikliği commit edip `yayin` dalına push edin.

İş akışını elle çalıştırmak için: **Actions → GitHub Pages'e yayımla → Run workflow**.

## 4. iPad'de Ana Ekran'a ekleme

1. iPad'de **Safari** ile `https://KULLANICI_ADINIZ.github.io/book-stand/` adresini açın.
2. Paylaş düğmesi (yukarı ok) → **Ana Ekrana Ekle** → ad **book-stand** → **Ekle**.
3. Bundan sonra uygulamayı **her zaman Ana Ekran'daki simgeden** açın.

> Önemli: iPadOS'ta Ana Ekran uygulaması ile Safari sekmesi **ayrı depolama** kullanır. Safari
> sekmesinde eklediğiniz kitaplar Ana Ekran uygulamasında görünmez (ve tersi).

## 5. Güncellemeler nasıl çalışır?

- Her yayında GitHub Actions, service worker'a commit kimliğini yazar; dosya değiştiği için iPad yeni sürümü fark eder.
- Uygulama açıldığında, öne geldiğinde, internete bağlandığında ve 30 dakikada bir güncelleme denetlenir.
- Yeni sürüm hazır olduğunda:
  - **Kaydedilmemiş çalışma yoksa** (ve kalemle yazdığınız bir ekranda değilseniz ya da uygulama yeni açıldıysa)
    bekleyen kayıtlar yazılır ve uygulama sessizce yenilenir. Uygulama arka plana alındığında da güncellenir.
  - **Kaydedilmemiş çalışma varsa** veya PDF/defterde yazıyorsanız üstte “yeni sürüm hazır” bildirimi
    çıkar; **Kaydet ve güncelle** ile geçebilirsiniz.
- Ayarlar → Sürüm → **Güncellemeleri denetle** ile elle de denetleyebilirsiniz.

## 6. Veriler, depolama ve yedek

- Tüm veriler (PDF'ler, çizimler, defter, yanlış defteri, ayraçlar, raporlar) **yalnızca iPad'de**, uygulamanın
  tarayıcı veritabanında (IndexedDB) saklanır ve iPad'in depolama alanını kullanır.
- **iCloud, CloudKit veya başka bir bulut hizmetine yükleme/eşitleme yoktur.** PDF'leriniz GitHub'a gönderilmez.
- Service worker yalnızca uygulama dosyalarını önbelleğe alır; **PDF'leriniz önbelleğe konmaz.**
- Ayarlar → Depolama: kullanılan alan (tarayıcının tahmini) ve kalıcı depolama durumu gösterilir.
- **Tarayıcı verileri silinirse kayıtlar kaybolur** (ör. Ayarlar › Safari › Geçmişi ve Web Sitesi Verilerini Sil,
  uygulamayı Ana Ekran'dan silmek, iPad'in depolama temizliği).
- Ayarlar → Yedekleme → **Yedeği dışa aktar**: her şey tek bir `.zip` dosyasına aktarılır; paylaşım
  sayfasından **Dosyalara Kaydet** ile saklayın. **Yedekten geri yükle** mevcut verilerin yerine geçer.

> Bu proje klasörü Masaüstünüzde olduğundan ve Masaüstünüz OneDrive ile eşitlendiğinden, **proje kodu**
> OneDrive'a yedeklenir. Bu, uygulamanın iPad'deki verilerini (PDF'ler, notlar) kapsamaz; onlar yalnızca
> iPad'de kalır.

## 7. Apple Pencil ve iPad Safari sınırları

- **Apple'ın yerel PencilKit araç paleti PWA'larda kullanılamaz.** book-stand, tarayıcının Pointer Events
  desteğiyle kendi sade araç çubuğunu kullanır: Gezin, Kalem, Vurgula, Silgi (nesne silgisi: çizginin tamamını;
  piksel silgisi: yalnızca üzerinden geçilen yeri siler), Soru seç, renkler, kalınlık,
  Geri al. Uygulama yerel Apple paletini kullanıyormuş gibi davranmaz.
- Safari kalem basıncını bildirdiğinde çizgi kalınlığı basınca göre değişir.
- Apple Pencil ilk kullanıldığında **parmakla çizim** kapanır: kalem yazar, parmak sayfayı kaydırır (avuç içi
  çizmez). Bu modda parmakla kaydırma tarayıcının kendi akıcı kaydırmasıyla yapılır. Araç çubuğundaki
  “Parmak” düğmesiyle değiştirilebilir.
- Desteklenmeyenler: kalemin çift dokunma/sıkma hareketleri, PencilKit şekil tanıma ve el yazısı tanıma,
  Scribble ile PDF'e yazı yazma, arka planda eşitleme/bildirim, Dosyalar uygulamasındaki bir klasöre
  otomatik kayıt.
- Çok büyük PDF'lerde iPad Safari'nin bellek sınırına takılmamak için yalnızca ekrandaki ve yakınındaki
  sayfalar çizilir.
- Kıstırarak yakınlaştırma Safari'nin hareket olaylarıyla yapılır; ayrıca üst çubukta yakınlaştır/uzaklaştır
  düğmeleri vardır.

## 8. Çevrimdışı kullanım

İlk açılıştan sonra uygulama dosyaları önbelleğe alınır; PDF okuma, yazma, defter, yanlış defteri ve rapor
internetsiz çalışır. İnternet yalnızca güncellemeleri almak için gerekir.

## Proje yapısı

```
index.html, manifest.webmanifest, sw.js   Uygulama kabuğu, PWA manifesti, service worker
css/app.css                               Temalar ve arayüz
js/                                       Uygulama modülleri (views/ ekranlar)
vendor/pdfjs/                             PDF.js (değiştirilmeden kopyalandı)
icons/                                    Uygulama simgeleri (kaynak: icon-full.svg, üretmek için: npm run icons)
tools/                                    Yerel sunucu, yayın hazırlama/denetim, simge üretimi
.github/workflows/pages.yml               GitHub Pages dağıtımı
```

PDF.js'i güncellemek için: `npm install`, `npm run vendor`, ardından `sw.js` içindeki
`DATA_CACHE` adındaki sürüm numarasını güncelleyin.
