```# 🚗 AkıllıPark: Otopark Yönetim ve Otomasyon Sistemi

Bu proje, modern şehircilik ihtiyaçlarına yönelik olarak geliştirilmiş, donanım destekli bir **Akıllı Otopark Yönetim Sistemi**dir. RFID teknolojisi ile yetkilendirme sağlar ve C# tabanlı bir arayüz ile otopark doluluk oranlarını gerçek zamanlı takip eder.

---

## ✨ Temel Özellikler

* **🛡️ Güvenli Giriş-Çıkış:** RFID kart okuyucu ile abone tanıma sistemi.
* **📊 Gerçek Zamanlı Takip:** Otoparktaki araç sayısı ve doluluk durumunun anlık izlenmesi.
* **🖥️ Yönetim Paneli:** Araç kayıt, abone yönetimi ve geçmiş giriş-çıkış raporları.
* **⚙️ Otomatik Bariyer:** Arduino ve Servo motor entegrasyonu ile otomatik kapı kontrolü.
* **💾 Güvenli Veri Depolama:** Microsoft SQL Server tabanlı veri yönetimi.

---

## 🛠️ Teknik Altyapı

### Yazılım Bileşenleri (Software)
* **Dil:** C# (Windows Form Application)
* **Veritabanı:** Microsoft SQL Server
* **İletişim:** Serial Port (Arduino - C# Haberleşmesi)
* **IDE:** Visual Studio

### Donanım Bileşenleri (Hardware)
* **Mikrodenetleyici:** Arduino Uno
* **RFID Modülü:** MFRC522 (Giriş yetkilendirme için)
* **Aktüatör:** Servo Motor (Bariyer kontrolü)
* **Bildirim:** LCD Ekran (Durum mesajları), Buzzer ve LED (Sesli/Görsel uyarılar)

---

## 📂 Proje Yapısı

* `Software/` -> C# Kaynak kodları ve Veritabanı (SQL) dosyaları.
* `Hardware/` -> Arduino (.ino) kodları ve Devre şeması.
* `Docs/` -> Proje raporu, kullanıcı klavuzu ve diyagramlar.

---

## 🚀 Kurulum ve Çalıştırma

1.  **Donanım Hazırlığı:**
    * Arduino bağlantılarını teknik raporda belirtilen pin şemasına göre tamamlayın.
    * `Hardware/` klasöründeki kodu Arduino IDE ile karta yükleyin.

2.  **Veritabanı Yapılandırması:**
    * SQL Server üzerinde `AkilliParkDB` isimli bir veritabanı oluşturun.
    * Tablo yapılarını (Araçlar, Aboneler vb.) rapor ekindeki SQL scriptleri ile kurun.

3.  **Yazılımın Çalıştırılması:**
    * Projeyi Visual Studio ile açın.
    * `App.config` içindeki **Connection String** (bağlantı adresi) kısmını kendi SQL Server bilgilerinizle güncelleyin.
    * Projeyi derleyin ve başlatın.

---

## 💡 Projenin Amacı

Bu sistem, manuel park yönetimindeki zaman kaybını önlemek, insan hatalarını minimize etmek ve otopark güvenliğini otomatize ederek verimliliği artırmak amacıyla tasarlanmıştır.
```
