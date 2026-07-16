# KumpulKuy 👋 — Real-time Meetup Coordination App

KumpulKuy adalah aplikasi mobile berbasis **React Native** dan **Expo (SDK 57)** yang dirancang khusus untuk memfasilitasi janji temu kumpul-kumpul (*meetups*) bersama rekan atau teman secara real-time. Aplikasi ini tidak hanya memungkinkan pengguna membuat dan mengelola janji temu, tetapi juga menawarkan integrasi peta interaktif untuk melacak posisi GPS sesama peserta secara langsung, navigasi rute berkendara, serta fitur obrolan grup interaktif yang dilengkapi indikator status baca (*read receipts*).

---

## ✨ Fitur Utama & Detail Pembaruan

Aplikasi KumpulKuy dilengkapi dengan serangkaian fitur premium berikut:

### 1. 🔐 Autentikasi & Manajemen Profil Pengguna
* **Autentikasi Aman**: Login dan registrasi akun menggunakan **Supabase Auth** berbasis email dan kata sandi.
* **Efek Getar Interaktif (Wobble/Shake Animation)**: Card form login akan bergetar secara otomatis apabila pengguna memasukkan input kosong, kata sandi kurang dari 6 karakter, atau terjadi kesalahan kredensial saat login/register.
* **Manajemen Profil Dinamis**: Mengubah nama panggilan/tampilan (*Display Name*) secara dinamis dari dalam aplikasi, yang otomatis memperbarui penanda (*marker pin*) di peta agar mudah diidentifikasi oleh rekan perjalanan Anda.

### 2. 📅 Manajemen Acara & Detail Acara (Meetups)
* **Pembuatan Meetup Baru**: Menentukan judul, deskripsi deskriptif, alamat tujuan, serta tanggal dan waktu janji temu menggunakan `@react-native-community/datetimepicker`.
* **Pemilih Lokasi Peta Interaktif (Map Picker)**: Peta LeafletJS terintegrasi di dalam WebView yang memungkinkan pengguna menentukan titik tujuan kumpul secara visual dengan cara menggeser pin marker (*draggable marker*) atau mengetuk peta di mana saja.
* **Pencarian Alamat & Auto-Geocoding**: Terintegrasi dengan API **Nominatim OpenStreetMap**. Pengguna cukup mengetik nama tempat atau alamat di kolom input, lalu menekan tombol pencari/geocode untuk memfokuskan kamera peta picker dan memindahkan pin secara otomatis ke koordinat yang sesuai.
* **Kelola Partisipasi**: 
  * Bergabung (*Join*) ke meetup buatan teman untuk membagikan lokasi GPS Anda.
  * Keluar (*Leave*) dari partisipasi meetup kapan saja jika batal hadir.
  * Menghapus (*Delete*) meetup, eksklusif untuk pembuat meetup (*creator*), yang secara otomatis membersihkan seluruh data obrolan dan koordinat GPS terkait di database.
* **Pencarian & Penyaringan Meetup**:
  * Kolom pencari instan berdasarkan nama acara atau nama alamat tujuan.
  * Tab filter kategori: **Semua** (melihat seluruh janji temu), **Meetup Saya** (meetup yang Anda buat atau ikuti), dan **Mendatang** (meetup yang belum terlaksana).

### 3. 🗺️ Pelacakan GPS & Rute Berkendara Real-time (OSRM)
* **Skema Kode Warna Penanda (Pin Marker)**:
  * 🔴 **Pin Merah**: Menandakan lokasi tujuan meetup (*meetup destination*).
  * 🔵 **Pin Biru**: Lokasi Anda saat ini secara real-time.
  * 🟢 **Pin Hijau**: Lokasi peserta lain yang sedang aktif di halaman detail.
* **Gambar Rute Berkendara Otomatis (OSRM Driving Route)**: Menggambar rute rute jalan darat dari posisi Anda saat ini menuju titik kumpul menggunakan API **OSRM (Open Source Routing Machine)**. Rute digambar sebagai garis putus-putus premium berwarna Indigo (`#6366F1`) di atas peta.
* **Kontrol Kamera Peta Pintar**:
  * 🎯 **Fokus Saya**: Menggeser kamera langsung ke koordinat GPS Anda.
  * 🏁 **Fokus Tujuan**: Menggeser kamera langsung ke koordinat titik kumpul.
  * 👥 **Fokus Semua**: Melakukan *auto-fit bounds* kamera secara dinamis agar seluruh pin marker (tujuan dan semua peserta) masuk ke dalam viewport layar.
* **Background GPS Tracking**: Melacak pergerakan GPS perangkat secara asinkron di latar belakang menggunakan `expo-location` dan memperbaruinya ke database dengan interval waktu/jarak tertentu.

### 4. 💬 Obrolan Grup Real-time & Status Baca (Read Status)
* **Obrolan Grup Terintegrasi**: Diskusi langsung di dalam panel detail meetup dengan sheet geser (*slide-up panel*) yang fleksibel (dapat dimaksimalkan atau diminimalkan).
* **Supabase Realtime Sync**: Pesan terkirim dan diterima secara instan tanpa perlu memuat ulang halaman (*real-time database subscription*).
* **Indikator Centang Baca (Read Receipts)**: 
  * Pesan Anda yang belum dibaca dilabeli status **`✓ Terkirim`**.
  * Pesan Anda yang sudah dibaca peserta lain otomatis berganti label menjadi **`✓✓ Dibaca oleh: [Nama-Nama Teman]`** secara real-time berdasarkan waktu baca terakhir (`last_read_at`) masing-masing peserta.
* **Notifikasi Pesan Baru dalam Aplikasi**: Muncul banner melayang (*floating notification banner*) di bagian atas detail screen jika ada pesan baru masuk dari peserta lain ketika Anda sedang tidak membuka tab chat. Dilengkapi tombol pintas **"Balas ➔"** untuk berpindah tab secara instan.

### 5. ⏰ Pengingat Waktu Cerdas (Smart Event Reminders)
* **Pengingat Daftar Meetup**: Banner darurat kuning-merah (🚨) akan muncul di bagian atas daftar meetup jika ada acara kumpul yang dijadwalkan akan dimulai dalam kurun waktu kurang dari 2 jam.
* **Status Detail Meetup**: Menampilkan bar status peringatan hitung mundur waktu di bagian atas sheet detail (misalnya: *"Acara dimulai dalam X menit/jam lagi!"*) jika waktu meetup tersisa kurang dari 24 jam.

---

## 🛠️ Tech Stack

* **Mobile Framework**: React Native & Expo SDK 57 (Managed Workflow)
* **Database & Realtime Service**: Supabase (Auth, Database PostgreSQL, & Realtime Broadcast/Presence/Postgres Changes)
* **Peta Interaktif**: Leaflet.js (diakses melalui `react-native-webview` dengan jembatan komunikasi `postMessage`)
* **Routing Engine**: OSRM API (Open Source Routing Machine)
* **Geocoding Engine**: Nominatim OpenStreetMap API
* **Local Storage**: `@react-native-async-storage/async-storage` (digunakan Supabase client untuk persistensi sesi login)
* **UI & Animasi**: React Native Stylesheet & Animated API

---

## 📂 Struktur Folder Utama

```text
itinerary-app/
├── App.js                 # Entry point aplikasi (Konfigurasi Sesi Auth & Stack Navigation)
├── screens/
│   ├── LoginScreen.js     # Layar Login/Daftar (Validasi input & Efek getar form)
│   ├── RoomListScreen.js  # Layar Home (Daftar meetup, filter, search, profile, & map picker)
│   └── DetailScreen.js    # Layar Peta Detail (Leaflet Map, OSRM Route, Real-time Chat, & Notifikasi)
├── lib/
│   └── supabase.js        # Konfigurasi & Inisialisasi Supabase client
├── assets/
│   └── images/            # File asset gambar, splash screen, dan icon aplikasi
├── package.json           # File manifes dependensi & skrip npm
└── .env                   # Environment variable konfigurasi Supabase (lokal)
```

---

## 🚀 Panduan Instalasi & Menjalankan Aplikasi

### 1. Prasyarat
Pastikan Anda sudah memasang **Node.js** di komputer Anda, serta aplikasi **Expo Go** pada ponsel pintar Anda (atau emulator Android Studio / Xcode Simulator).

### 2. Pasang Dependensi
Buka terminal di root direktori proyek, kemudian jalankan:
```bash
npm install
```

### 3. Konfigurasi Variabel Lingkungan (`.env`)
Buat berkas bernama `.env` di root direktori proyek (berkas ini sudah ditambahkan ke `.gitignore` demi keamanan) dan isi dengan kredensial Supabase Anda:
```env
EXPO_PUBLIC_SUPABASE_URL=https://your-supabase-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
```
*(Anda dapat menyalin templat dari berkas `.env.example`)*

### 4. Menjalankan Server Metro
Nyalakan server development Metro dengan perintah berikut:
```bash
npx expo start -c
```
*Gunakan bendera `-c` pada peluncuran perdana untuk memastikan cache dibersihkan dan variabel lingkungan `.env` terbaca sempurna.*

Buka aplikasi **Expo Go** di ponsel Anda, lalu pindai kode QR yang tercetak di layar terminal Anda.

---

## 🛠️ Panduan Build Aplikasi (Development & Release)

Aplikasi ini dapat dikompilasi menjadi paket aplikasi biner mandiri melalui metode **Lokal (Local Build)** maupun **Awan (EAS Cloud Build)**.

### 1. Build untuk Tahap Development (Debug/Testing)
Development Build menyertakan pustaka native kustom (seperti `react-native-webview` dan `expo-location`) ke dalam aplikasi biner Anda agar dapat berjalan stabil di luar keterbatasan bawaan Expo Go.

* **A. Build & Run Lokal (Memerlukan Android Studio / Xcode di PC Anda):**
  ```bash
  # Build Android (Menghasilkan APK Debug & memasangnya di HP/Emulator)
  npx expo run:android

  # Build iOS (Mengompilasi dan menjalankan di iOS Simulator)
  npx expo run:ios
  ```
* **B. Build Cloud (Menggunakan Server EAS):**
  ```bash
  # Build Android
  eas build --platform android --profile development
  
  # Build iOS
  eas build --platform ios --profile development
  ```

### 2. Build untuk Tahap Release (Produksi / Siap Edar)
Release Build mengompilasi seluruh kode JavaScript ke biner teroptimasi penuh (berjalan mandiri tanpa ketergantungan Metro Bundler).

* **A. Build Release Lokal:**
  ```bash
  # Android (Menghasilkan APK / AAB produksi lokal)
  npx expo run:android --variant release

  # iOS (Menghasilkan aplikasi biner produksi lokal)
  npx expo run:ios --configuration Release
  ```
* **B. Build Release Cloud (EAS):**
  ```bash
  # Build untuk kedua platform
  eas build --platform all --profile production
  
  # Build Android saja (.aab siap diunggah ke Google Play)
  eas build --platform android --profile production
  
  # Build iOS saja (.ipa siap diunggah ke Apple App Store)
  eas build --platform ios --profile production
  ```
* **C. Build Cloud & Submit Otomatis (Auto-Submit):**
  ```bash
  eas build --platform all --profile production --auto-submit
  ```

---

## 🗄️ Skema Database Supabase & Kebijakan Keamanan (RLS)

Berikut adalah skrip SQL DDL lengkap yang harus dieksekusi di dalam **SQL Editor** pada dasbor Supabase Anda. 

> [!IMPORTANT]
> **Pencegahan Error Infinite Recursion**: Kebijakan RLS (Row Level Security) pada tabel `meetup_participants` telah disesuaikan agar terbebas dari rekursi melingkar (*circular reference*). Sebelumnya, kebijakan select pada `meetup_participants` merujuk ke tabel `meetups`, sedangkan kebijakan select pada `meetups` merujuk kembali ke `meetup_participants`, memicu crash rekursi tanpa henti di PostgreSQL. Kebijatan select pada rancangan database di bawah telah disederhanakan dengan aman ke `auth.uid() is not null`.

```sql
-- ==========================================
-- 1. TABEL PROFILES & TRIGGER AUTOMATION
-- ==========================================
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique,
  full_name text,
  avatar_url text,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Mengaktifkan Row Level Security (RLS)
alter table public.profiles enable row level security;

-- Hapus kebijakan lama jika ada
drop policy if exists "Allow public read access to profiles" on public.profiles;
drop policy if exists "Allow individual update to own profile" on public.profiles;
drop policy if exists "Allow individual insert to own profile" on public.profiles;

-- Membuat kebijakan RLS profiles
create policy "Allow public read access to profiles" on public.profiles
  for select using (true);

create policy "Allow individual update to own profile" on public.profiles
  for update using (auth.uid() = id);

create policy "Allow individual insert to own profile" on public.profiles
  for insert with check (auth.uid() = id);

-- Otomatisasi Pembuatan Profil Saat Pendaftaran Baru
drop trigger if exists on_auth_user_created on auth.users;

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, full_name, avatar_url)
  values (
    new.id,
    split_part(new.email, '@', 1), -- default username diambil dari awalan email
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ==========================================
-- 2. TABEL MEETUPS (ACARA KUMPUL)
-- ==========================================
create table if not exists public.meetups (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text,
  destination_lat double precision not null,
  destination_lng double precision not null,
  destination_address text,
  scheduled_at timestamp with time zone not null,
  created_by uuid references public.profiles(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Mengaktifkan RLS meetups
alter table public.meetups enable row level security;

drop policy if exists "Allow authenticated users to create meetups" on public.meetups;
drop policy if exists "Allow authenticated users to view all meetups" on public.meetups;
drop policy if exists "Allow creator to delete their meetups" on public.meetups;

-- Membuat kebijakan RLS meetups
create policy "Allow authenticated users to create meetups" on public.meetups
  for insert with check (auth.uid() = created_by);

create policy "Allow authenticated users to view all meetups" on public.meetups
  for select using (auth.uid() is not null);

create policy "Allow creator to delete their meetups" on public.meetups
  for delete using (auth.uid() = created_by);


-- ==========================================
-- 3. TABEL MEETUP PARTICIPANTS
-- ==========================================
create table if not exists public.meetup_participants (
  meetup_id uuid references public.meetups(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  status text default 'joined' check (status in ('joined', 'declined', 'pending')),
  joined_at timestamp with time zone default timezone('utc'::text, now()) not null,
  last_read_at timestamp with time zone, -- Waktu baca pesan obrolan terakhir kali
  primary key (meetup_id, user_id)
);

-- Mengaktifkan RLS meetup_participants
alter table public.meetup_participants enable row level security;

drop policy if exists "Allow authenticated users to view participants" on public.meetup_participants;
drop policy if exists "Allow users to join meetups" on public.meetup_participants;
drop policy if exists "Allow users to leave meetups" on public.meetup_participants;
drop policy if exists "Allow users to update their own participant record" on public.meetup_participants;

-- Membuat kebijakan RLS (Bebas dari Rekursi Melingkar)
create policy "Allow authenticated users to view participants" on public.meetup_participants
  for select using (auth.uid() is not null);

create policy "Allow users to join meetups" on public.meetup_participants
  for insert with check (auth.uid() = user_id);

create policy "Allow users to leave meetups" on public.meetup_participants
  for delete using (auth.uid() = user_id);

create policy "Allow users to update their own participant record" on public.meetup_participants
  for update using (auth.uid() = user_id);


-- ==========================================
-- 4. TABEL USER LOCATIONS (GPS TRACKING)
-- ==========================================
create table if not exists public.user_locations (
  meetup_id uuid references public.meetups(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (meetup_id, user_id)
);

-- Mengaktifkan RLS user_locations
alter table public.user_locations enable row level security;

drop policy if exists "Allow users to view locations of their meetup peers" on public.user_locations;
drop policy if exists "Allow users to insert their own locations" on public.user_locations;
drop policy if exists "Allow users to update their own locations" on public.user_locations;

-- Membuat kebijakan RLS (Pemisahan INSERT & UPDATE agar operasi `upsert` GPS berhasil)
create policy "Allow users to view locations of their meetup peers" on public.user_locations
  for select using (
    exists (
      select 1 from public.meetup_participants
      where meetup_participants.meetup_id = user_locations.meetup_id 
        and meetup_participants.user_id = auth.uid()
    )
  );

create policy "Allow users to insert their own locations" on public.user_locations
  for insert with check (auth.uid() = user_id);

create policy "Allow users to update their own locations" on public.user_locations
  for update using (auth.uid() = user_id);


-- ==========================================
-- 5. TABEL MEETUP MESSAGES (CHAT)
-- ==========================================
create table if not exists public.meetup_messages (
  id uuid default gen_random_uuid() primary key,
  meetup_id uuid references public.meetups(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  message text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Mengaktifkan RLS meetup_messages
alter table public.meetup_messages enable row level security;

drop policy if exists "Allow participants to view messages" on public.meetup_messages;
drop policy if exists "Allow participants to post messages" on public.meetup_messages;

-- Membuat kebijakan RLS meetup_messages
create policy "Allow participants to view messages" on public.meetup_messages
  for select using (
    exists (
      select 1 from public.meetup_participants
      where meetup_participants.meetup_id = meetup_id and meetup_participants.user_id = auth.uid()
    )
  );

create policy "Allow participants to post messages" on public.meetup_messages
  for insert with check (
    auth.uid() = user_id and
    exists (
      select 1 from public.meetup_participants
      where meetup_participants.meetup_id = meetup_id and meetup_participants.user_id = auth.uid()
    )
  );
```

---

## ⚙️ Mengaktifkan Layanan Realtime di Supabase

Peta lokasi yang interaktif, notifikasi, status baca, dan percakapan chat grup bergantung sepenuhnya pada modul sinkronisasi data instan Supabase. Anda wajib mendaftarkan tabel-tabel berikut ke dalam skema publikasi **Replication/Realtime** melalui Dasbor Supabase (*Supabase Dashboard -> Database -> Replication -> Edit supabase_realtime*):

1. **`user_locations`**: Mempublikasikan pembaruan koordinat latitude & longitude peserta lain pada peta secara instan.
2. **`meetup_messages`**: Mengalirkan pesan obrolan grup baru yang masuk ke layar obrolan peserta lain.
3. **`meetup_participants`**: Mempublikasikan pembaruan kolom `last_read_at` secara real-time guna memperbarui status centang baca chat (`Read Receipts`).

---

## 📄 Lisensi
Proyek ini dilindungi di bawah lisensi [MIT License](file:///home/bie/development/project/mobile/itinerary-app/LICENSE).
