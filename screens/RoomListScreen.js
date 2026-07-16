import DateTimePicker from '@react-native-community/datetimepicker';
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import * as Linking from 'expo-linking';
import { supabase } from '../lib/supabase';

export default function RoomListScreen({ navigation }) {
  const [meetups, setMeetups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [fetchingLocation, setFetchingLocation] = useState(false);
  const [searching, setSearching] = useState(false);
  
  // States Baru untuk Pencarian, Penyaringan, dan Geocoding
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all'); // 'all', 'mine', 'upcoming'
  const [upcomingMeetup, setUpcomingMeetup] = useState(null);
  const [isGeocoding, setIsGeocoding] = useState(false);

  // User Profile States
  const [currentUserId, setCurrentUserId] = useState(null);
  const [userEmail, setUserEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
 
  // Form states
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState(-6.200000); // Default Jakarta
  const [longitude, setLongitude] = useState(106.816666); // Default Jakarta
  
  // Date & Time Picker States
  const [scheduledDate, setScheduledDate] = useState(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const pickerWebViewRef = useRef(null);

  useEffect(() => {
    fetchUserData();
    fetchMeetups();

    // 1. Tangani URL saat aplikasi sudah terbuka di background
    const subscription = Linking.addEventListener('url', (event) => {
      handleDeepLink(event.url);
    });

    // 2. Tangani URL jika aplikasi dibuka dingin (cold start) dari link
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink(url);
      }
    });

    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, []);

  async function handleDeepLink(url) {
    try {
      const parsed = Linking.parse(url);
      // Format URL: kumpulkuy://join-meetup?id=UUID
      // Atau exp://IP:PORT/--/join-meetup?id=UUID
      if (url.includes('join-meetup') || parsed.path === 'join-meetup') {
        const meetupId = parsed.queryParams?.id;
        if (meetupId) {
          promptJoinMeetup(meetupId);
        }
      }
    } catch (err) {
      console.log('Error parsing deep link:', err.message);
    }
  }

  async function promptJoinMeetup(meetupId) {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Autentikasi Diperlukan 🔑', 'Silakan masuk ke akun Anda terlebih dahulu sebelum bergabung.');
        return;
      }

      // Fetch details untuk judul
      const { data: meetup, error } = await supabase
        .from('meetups')
        .select('*, meetup_participants(user_id)')
        .eq('id', meetupId)
        .single();

      if (error) throw error;

      if (!meetup) {
        Alert.alert('Error ⚠️', 'Acara kumpul tidak ditemukan.');
        return;
      }

      const isParticipant = meetup.meetup_participants?.some(p => p.user_id === user.id);
      if (isParticipant) {
        // Jika sudah bergabung, langsung arahkan ke DetailScreen
        navigation.navigate('Detail', { meetup });
        return;
      }

      Alert.alert(
        'Undangan Gabung Meetup 📅',
        `Apakah Anda ingin bergabung ke meetup "${meetup.title}" di "${meetup.destination_address}"?`,
        [
          { text: 'Batal', style: 'cancel' },
          {
            text: 'Gabung',
            onPress: async () => {
              setLoading(true);
              try {
                const { error: joinError } = await supabase
                  .from('meetup_participants')
                  .insert({
                    meetup_id: meetupId,
                    user_id: user.id,
                    status: 'joined',
                  });

                if (joinError) throw joinError;

                Alert.alert('Sukses 🎉', 'Berhasil bergabung ke meetup!');
                fetchMeetups();
                navigation.navigate('Detail', { meetup });
              } catch (err) {
                Alert.alert('Gagal Bergabung ⚠️', err.message);
              } finally {
                setLoading(false);
              }
            }
          }
        ]
      );
    } catch (err) {
      Alert.alert('Error ⚠️', 'Gagal memproses link undangan: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  // Memantau meetup terdekat dalam waktu 2 jam ke depan
  useEffect(() => {
    if (meetups.length > 0 && currentUserId) {
      const now = new Date().getTime();
      const twoHoursMs = 2 * 60 * 60 * 1000;
      
      const activeMeetups = meetups.filter(m => {
        const isCreator = m.creator_id === currentUserId;
        const isJoined = m.meetup_participants?.some(p => p.user_id === currentUserId);
        return isCreator || isJoined;
      });

      const upcoming = activeMeetups
        .map(m => ({ ...m, diff: new Date(m.scheduled_at).getTime() - now }))
        .filter(m => m.diff > 0 && m.diff <= twoHoursMs)
        .sort((a, b) => a.diff - b.diff)[0];

      setUpcomingMeetup(upcoming || null);
    } else {
      setUpcomingMeetup(null);
    }
  }, [meetups, currentUserId]);

  async function fetchUserData() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        setUserEmail(user.email);
        
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, username')
          .eq('id', user.id)
          .single();

        if (profile) {
          const name = profile.full_name || profile.username || user.email.split('@')[0];
          setDisplayName(name);
          setNewDisplayName(name);
        } else {
          const defaultName = user.email.split('@')[0];
          setDisplayName(defaultName);
          setNewDisplayName(defaultName);
        }
      }
    } catch (err) {
      console.log('Error fetching user profile:', err.message);
    }
  }

  async function handleUpdateProfile() {
    if (!newDisplayName.trim()) {
      Alert.alert('Error', 'Nama tampilan tidak boleh kosong.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: newDisplayName,
          updated_at: new Date().toISOString(),
        })
        .eq('id', currentUserId);

      if (error) throw error;

      setDisplayName(newDisplayName);
      Alert.alert('Sukses', 'Nama tampilan profil berhasil diperbarui!');
      setProfileModalVisible(false);
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  }

  // Load meetups beserta dengan list partisipannya untuk melacak status Gabung
  async function fetchMeetups() {
    setLoading(true);
    const { data, error } = await supabase
      .from('meetups')
      .select('*, meetup_participants(user_id)')
      .order('created_at', { ascending: false });

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setMeetups(data || []);
    }
    setLoading(false);
  }

  // Fungsi untuk bergabung ke meetup orang lain
  async function handleJoinMeetup(meetupId) {
    if (!currentUserId) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('meetup_participants')
        .insert({
          meetup_id: meetupId,
          user_id: currentUserId,
          status: 'joined',
        });

      if (error) throw error;

      Alert.alert('Sukses', 'Berhasil bergabung ke acara kumpul ini!');
      fetchMeetups();
    } catch (err) {
      Alert.alert('Gagal', err.message);
      setLoading(false);
    }
  }

  // Fungsi untuk keluar dari partisipasi meetup
  async function handleLeaveMeetup(meetupId) {
    if (!currentUserId) return;
    Alert.alert(
      'Keluar Meetup',
      'Apakah Anda yakin ingin keluar dari meetup ini? Anda tidak akan bisa lagi melacak lokasi teman atau berpartisipasi dalam obrolan.',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Keluar',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              const { error } = await supabase
                .from('meetup_participants')
                .delete()
                .eq('meetup_id', meetupId)
                .eq('user_id', currentUserId);

              if (error) throw error;

              Alert.alert('Sukses', 'Anda telah keluar dari meetup.');
              fetchMeetups();
            } catch (err) {
              Alert.alert('Gagal Keluar', err.message);
              setLoading(false);
            }
          },
        },
      ]
    );
  }

  async function handleDeleteMeetup(meetupId) {
    Alert.alert(
      'Hapus Meetup',
      'Apakah Anda yakin ingin menghapus meetup ini? Seluruh riwayat koordinat peserta juga akan ikut terhapus.',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              const { error } = await supabase
                .from('meetups')
                .delete()
                .eq('id', meetupId);

              if (error) throw error;

              Alert.alert('Sukses', 'Meetup berhasil dihapus.');
              fetchMeetups();
            } catch (err) {
              Alert.alert('Gagal Menghapus', 'Anda tidak memiliki otoritas untuk menghapus meetup ini atau terjadi masalah koneksi.');
              console.log('Error deleting meetup:', err.message);
              setLoading(false);
            }
          },
        },
      ]
    );
  }

  async function handleSearchLocation() {
    if (!address) {
      Alert.alert('Info', 'Masukkan nama lokasi atau alamat terlebih dahulu di kolom alamat.');
      return;
    }

    setSearching(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          address
        )}&limit=1`,
        {
          headers: {
            'User-Agent': 'KumpulKuyApp/1.0',
          },
        }
      );
      const data = await response.json();

      if (data && data.length > 0) {
        const result = data[0];
        const newLat = parseFloat(result.lat);
        const newLng = parseFloat(result.lon);

        setLatitude(newLat);
        setLongitude(newLng);
        setAddress(result.display_name);

        pickerWebViewRef.current?.postMessage(
          JSON.stringify({
            type: 'PAN_TO',
            latitude: newLat,
            longitude: newLng,
          })
        );
      } else {
        Alert.alert('Tidak Ditemukan', 'Lokasi tidak ditemukan. Coba ketik nama tempat yang lebih lengkap.');
      }
    } catch (err) {
      Alert.alert('Error', 'Gagal mencari lokasi. Pastikan koneksi internet Anda aktif.');
    } finally {
      setSearching(false);
    }
  }

  async function openMapPicker() {
    setModalVisible(true);
    setFetchingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Izin Ditolak', 'Gagal memuat GPS. Menggunakan lokasi default.');
        setFetchingLocation(false);
        return;
      }

      const loc = await Location.getCurrentPositionAsync({});
      setLatitude(loc.coords.latitude);
      setLongitude(loc.coords.longitude);
      setAddress('Lokasi Saya');
    } catch (err) {
      console.log('Error getting location for picker:', err.message);
    } finally {
      setFetchingLocation(false);
    }
  }

  function handleWebMessage(e) {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === 'LOCATION_SELECTED') {
        setLatitude(msg.latitude);
        setLongitude(msg.longitude);
      }
    } catch (err) {
      console.log('Error parsing web message:', err.message);
    }
  }

  // Fungsi auto-geocoding menggunakan Nominatim OpenStreetMap API
  async function handleGeocode() {
    if (!address.trim()) {
      Alert.alert('Alamat Kosong', 'Silakan ketik nama alamat/tempat tujuan terlebih dahulu.');
      return;
    }

    setIsGeocoding(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'KumpulKuyApp/1.0',
        },
      });
      const data = await res.json();

      if (data && data.length > 0) {
        const first = data[0];
        const newLat = parseFloat(first.lat);
        const newLng = parseFloat(first.lon);
        setLatitude(newLat);
        setLongitude(newLng);

        // Kirim koordinat baru ke web map picker juga (jika jembatan webview siap)
        if (pickerWebViewRef.current) {
          const runJS = `
            if (window.updateMarkerLocation) {
              window.updateMarkerLocation(${newLat}, ${newLng});
            }
            true;
          `;
          pickerWebViewRef.current.injectJavaScript(runJS);
        }

        Alert.alert(
          'Lokasi Ditemukan!',
          `Alamat: ${first.display_name.split(',')[0]}\n\nLat: ${newLat.toFixed(6)}\nLng: ${newLng.toFixed(6)}`
        );
      } else {
        Alert.alert('Tidak Ditemukan', 'Alamat tidak ditemukan. Silakan geser pin peta atau isi koordinat manual.');
      }
    } catch (err) {
      Alert.alert('Gagal Geocoding', 'Terjadi kesalahan jaringan: ' + err.message);
    } finally {
      setIsGeocoding(false);
    }
  }

  const onChangeDate = (event, selectedDate) => {
    setShowDatePicker(false);
    if (selectedDate) {
      const currentDate = new Date(scheduledDate);
      currentDate.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
      setScheduledDate(currentDate);
      
      if (Platform.OS === 'android') {
        setTimeout(() => setShowTimePicker(true), 100);
      } else {
        setShowTimePicker(true);
      }
    }
  };

  const onChangeTime = (event, selectedTime) => {
    setShowTimePicker(false);
    if (selectedTime) {
      const currentDate = new Date(scheduledDate);
      currentDate.setHours(selectedTime.getHours(), selectedTime.getMinutes());
      setScheduledDate(currentDate);
    }
  };

  async function handleCreateMeetup() {
    if (!title || !address) {
      Alert.alert('Error', 'Judul dan Alamat harus diisi.');
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { data: newMeetup, error: meetupError } = await supabase
        .from('meetups')
        .insert({
          title,
          description,
          destination_lat: latitude,
          destination_lng: longitude,
          destination_address: address,
          scheduled_at: scheduledDate.toISOString(),
          created_by: user.id,
        })
        .select()
        .single();

      if (meetupError) throw meetupError;

      const { error: participantError } = await supabase
        .from('meetup_participants')
        .insert({
          meetup_id: newMeetup.id,
          user_id: user.id,
          status: 'joined',
        });

      if (participantError) throw participantError;

      Alert.alert('Sukses', 'Meetup baru berhasil dibuat!');
      setModalVisible(false);
      
      setTitle('');
      setDescription('');
      setAddress('');
      setLatitude(-6.200000);
      setLongitude(106.816666);
      setScheduledDate(new Date(Date.now() + 24 * 60 * 60 * 1000));

      fetchMeetups();
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  }

  const pickerMapHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          body { margin: 0; padding: 0; }
          #map { height: 100vh; width: 100vw; }
          .leaflet-marker-icon {
            filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
          }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          const map = L.map('map', { zoomControl: false }).setView([${latitude}, ${longitude}], 15);
          
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap'
          }).addTo(map);

          // Marker pemilih dengan HTML kustom (mencegah bug Leaflet default icon tidak tampil di WebView)
          const pickerIconHtml = '<div style="background-color: #EF4444; width: 18px; height: 18px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 6px rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center;"><div style="background-color: white; width: 6px; height: 6px; border-radius: 50%;"></div></div>';
          const pickerIcon = L.divIcon({
            html: pickerIconHtml,
            className: 'custom-pin',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
          });
          let marker = L.marker([${latitude}, ${longitude}], { draggable: true, icon: pickerIcon }).addTo(map);

          function sendCoords(lat, lng) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'LOCATION_SELECTED',
              latitude: lat,
              longitude: lng
            }));
          }

          map.on('click', function(e) {
            const lat = e.latlng.lat;
            const lng = e.latlng.lng;
            marker.setLatLng(e.latlng);
            sendCoords(lat, lng);
          });

          marker.on('dragend', function(e) {
            const pos = marker.getLatLng();
            sendCoords(pos.lat, pos.lng);
          });

          window.addEventListener('message', function(e) {
            try {
              const msg = JSON.parse(e.data);
              if (msg.type === 'PAN_TO') {
                map.setView([msg.latitude, msg.longitude], 15);
                marker.setLatLng([msg.latitude, msg.longitude]);
              }
            } catch (err) {
              console.log("Error in iframe picker message listener:", err.message);
            }
          });
        </script>
      </body>
    </html>
  `;

  const filteredMeetups = meetups.filter((item) => {
    const matchesSearch = 
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.destination_address.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    const isCreator = currentUserId && item.created_by === currentUserId;
    const isJoined = item.meetup_participants?.some(p => p.user_id === currentUserId);
    
    if (activeFilter === 'mine') {
      return isCreator || isJoined;
    } else if (activeFilter === 'upcoming') {
      const scheduledTime = new Date(item.scheduled_at).getTime();
      const now = new Date().getTime();
      return scheduledTime > now;
    }

    return true; // 'all'
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.glowTop} />

      {/* Header Container */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.headerProfileRow} 
          onPress={() => setProfileModalVisible(true)}
          activeOpacity={0.8}
        >
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>🧑‍💻</Text>
          </View>
          <View style={styles.headerProfileTextContainer}>
            <Text style={styles.welcomeText}>Selamat Datang 👋</Text>
            <View style={styles.nameRow}>
              <Text style={styles.userEmailText}>{displayName || 'Kawan Kumpul'}</Text>
              <Text style={styles.editProfileIcon}>✏️</Text>
            </View>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnLogout} onPress={() => supabase.auth.signOut()}>
          <Text style={styles.btnLogoutText}>➔ Keluar</Text>
        </TouchableOpacity>
      </View>

      {/* Title */}
      <View style={styles.titleContainer}>
        <View style={styles.titleRow}>
          <Text style={styles.titleIcon}>🗺️</Text>
          <Text style={styles.titleText}>Meetup KumpulKuy</Text>
        </View>
        <Text style={styles.subTitleText}>Pilih acara untuk melacak dan berkumpul dengan teman Anda</Text>
      </View>

      {/* Upcoming Event Alert Banner */}
      {upcomingMeetup && (
        <TouchableOpacity 
          style={styles.upcomingAlertBanner}
          onPress={() => navigation.navigate('Detail', { meetup: upcomingMeetup })}
          activeOpacity={0.9}
        >
          <View style={styles.upcomingAlertRow}>
            <View style={styles.upcomingAlertLeft}>
              <Text style={styles.upcomingAlertIcon}>🚨</Text>
              <View>
                <Text style={styles.upcomingAlertTitle}>Acara Mendatang Terdekat!</Text>
                <Text style={styles.upcomingAlertDesc} numberOfLines={1}>
                  "{upcomingMeetup.title}" dijadwalkan dalam beberapa saat lagi. Ketuk untuk lacak.
                </Text>
              </View>
            </View>
            <Text style={styles.upcomingAlertArrow}>➡️</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Search and Filter Section */}
      <View style={styles.listSearchFilterContainer}>
        <View style={styles.listSearchInputWrapper}>
          <Text style={styles.listSearchIcon}>🔍</Text>
          <TextInput
            style={styles.listSearchInputField}
            placeholder="Cari nama meetup atau alamat..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Text style={styles.listClearSearchIcon}>✖️</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.listFilterTabs}>
          <TouchableOpacity 
            style={[styles.listFilterTab, activeFilter === 'all' && styles.listFilterTabActive]}
            onPress={() => setActiveFilter('all')}
          >
            <Text style={[styles.listFilterTabText, activeFilter === 'all' && styles.listFilterTabTextActive]}>🌐 Semua</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.listFilterTab, activeFilter === 'mine' && styles.listFilterTabActive]}
            onPress={() => setActiveFilter('mine')}
          >
            <Text style={[styles.listFilterTabText, activeFilter === 'mine' && styles.listFilterTabTextActive]}>👥 Meetup Saya</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.listFilterTab, activeFilter === 'upcoming' && styles.listFilterTabActive]}
            onPress={() => setActiveFilter('upcoming')}
          >
            <Text style={[styles.listFilterTabText, activeFilter === 'upcoming' && styles.listFilterTabTextActive]}>📅 Mendatang</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading && filteredMeetups.length === 0 ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#4F46E5" />
          <Text style={styles.loaderText}>Memuat daftar kumpul...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredMeetups}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const isCreator = currentUserId && item.created_by === currentUserId;
            // Periksa apakah user saat ini sudah bergabung ke meetup ini
            const isParticipant = item.meetup_participants?.some(
              (p) => p.user_id === currentUserId);
            const partCount = item.meetup_participants ? item.meetup_participants.length : 0;

            return (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderIcon}>
                    <Text style={styles.cardEmoji}>☕</Text>
                  </View>
                  <View style={styles.cardHeaderText}>
                    <View style={styles.cardTitleRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardTitle}>{item.title}</Text>
                        <View style={styles.badgeRow}>
                          {isCreator ? (
                            <View style={[styles.statusBadge, { backgroundColor: '#FEF3C7' }]}>
                              <Text style={[styles.statusBadgeText, { color: '#D97706' }]}>👑 Pembuat</Text>
                            </View>
                          ) : isParticipant ? (
                            <View style={[styles.statusBadge, { backgroundColor: '#E0F2FE' }]}>
                              <Text style={[styles.statusBadgeText, { color: '#0284C7' }]}>✅ Tergabung</Text>
                            </View>
                          ) : (
                            <View style={[styles.statusBadge, { backgroundColor: '#F1F5F9' }]}>
                              <Text style={[styles.statusBadgeText, { color: '#64748B' }]}>➕ Belum Ikut</Text>
                            </View>
                          )}
                          <View style={[styles.statusBadge, { backgroundColor: '#ECFDF5', marginLeft: 6 }]}>
                            <Text style={[styles.statusBadgeText, { color: '#059669' }]}>👥 {partCount} Teman</Text>
                          </View>
                        </View>
                      </View>
                      {isCreator && (
                        <TouchableOpacity 
                          style={styles.btnDelete} 
                          onPress={() => handleDeleteMeetup(item.id)}
                        >
                          <Text style={styles.btnDeleteText}>Hapus</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <Text style={styles.cardTime}>
                      📅 {new Date(item.scheduled_at).toLocaleDateString('id-ID', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })} pukul {new Date(item.scheduled_at).toLocaleTimeString('id-ID', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })} WIB
                    </Text>
                  </View>
                </View>
                
                <Text style={styles.cardDesc} numberOfLines={2}>
                  {item.description || 'Tidak ada deskripsi tambahan.'}
                </Text>
                
                <View style={styles.divider} />
                
                <View style={styles.cardFooter}>
                  <View style={styles.locationContainer}>
                    <Text style={styles.cardAddress}>📍 {item.destination_address}</Text>
                  </View>

                  <View style={styles.actionsContainer}>
                    {isParticipant ? (
                      <View style={styles.participantActions}>
                        {/* Jika sudah join dan bukan pembuat, tampilkan tombol Keluar */}
                        {!isCreator && (
                          <TouchableOpacity
                            style={styles.btnLeave}
                            onPress={() => handleLeaveMeetup(item.id)}
                          >
                            <Text style={styles.btnLeaveText}>Keluar</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          style={styles.btnDetail}
                          onPress={() => navigation.navigate('Detail', { meetup: item })}
                        >
                          <Text style={styles.btnDetailText}>Lacak Teman</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      // Jika belum join, tampilkan tombol Gabung Meetup
                      <TouchableOpacity
                        style={styles.btnJoin}
                        onPress={() => handleJoinMeetup(item.id)}
                      >
                        <Text style={styles.btnJoinText}>Gabung Meetup</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyText}>Belum ada acara kumpul.</Text>
              <Text style={styles.emptySubText}>Buat acara kumpul pertama Anda dengan menekan tombol + di bawah!</Text>
            </View>
          }
          refreshing={loading}
          onRefresh={fetchMeetups}
        />
      )}

      {/* Floating Action Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={openMapPicker}
        activeOpacity={0.8}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* Modal Edit Profile */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={profileModalVisible}
        onRequestClose={() => setProfileModalVisible(false)}
      >
        <View style={styles.modalBgCenter}>
          <View style={styles.profileModalContent}>
            <Text style={styles.modalTitle}>Ubah Profil Anda</Text>
            <Text style={styles.modalSubTitle}>Ganti nama panggilan Anda agar teman-teman mudah mengenali Anda di peta.</Text>

            <View style={styles.inputWrapper}>
              <Text style={styles.inputLabel}>Nama Tampilan</Text>
              <TextInput
                style={styles.input}
                placeholder="Tulis nama panggilan Anda..."
                placeholderTextColor="#94A3B8"
                value={newDisplayName}
                onChangeText={setNewDisplayName}
              />
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.btnCancel]}
                onPress={() => setProfileModalVisible(false)}
              >
                <Text style={styles.btnCancelText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.btnSave]}
                onPress={handleUpdateProfile}
              >
                <Text style={styles.btnSaveText}>Simpan</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Form Buat Meetup */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeaderBar} />
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>Buat Meetup Baru</Text>
              <Text style={styles.modalSubTitle}>Isi informasi meetup dan tentukan titik kumpul di peta.</Text>

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Nama Acara</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Kopi Sore / Main Futsal"
                  placeholderTextColor="#94A3B8"
                  value={title}
                  onChangeText={setTitle}
                />
              </View>

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Deskripsi Acara</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="e.g. Bawa kaos merah, kumpul di depan lobby"
                  placeholderTextColor="#94A3B8"
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  numberOfLines={2}
                />
              </View>

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Tanggal & Waktu Kumpul</Text>
                <TouchableOpacity 
                  style={styles.datePickerButton} 
                  onPress={() => setShowDatePicker(true)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.datePickerButtonText}>
                    📅 {scheduledDate.toLocaleDateString('id-ID', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric'
                    })} pukul {scheduledDate.toLocaleTimeString('id-ID', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })} WIB
                  </Text>
                </TouchableOpacity>
              </View>

              {showDatePicker && (
                <DateTimePicker
                  value={scheduledDate}
                  mode="date"
                  display="default"
                  onValueChange={onChangeDate}
                  onDismiss={() => setShowDatePicker(false)}
                  minimumDate={new Date()}
                />
              )}

              {showTimePicker && (
                <DateTimePicker
                  value={scheduledDate}
                  mode="time"
                  display="default"
                  is24Hour={true}
                  onValueChange={onChangeTime}
                  onDismiss={() => setShowTimePicker(false)}
                />
              )}

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Alamat / Cari Lokasi</Text>
                <View style={styles.searchContainer}>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Ketik lokasi & klik Cari (e.g. Monas)"
                    placeholderTextColor="#94A3B8"
                    value={address}
                    onChangeText={setAddress}
                    onSubmitEditing={handleSearchLocation}
                  />
                  <TouchableOpacity 
                    style={styles.btnSearch} 
                    onPress={handleSearchLocation}
                    disabled={searching}
                  >
                    {searching ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.btnSearchText}>Cari</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={styles.mapLabel}>Geser / Tap Peta untuk Detail Pin:</Text>
              
              {fetchingLocation ? (
                <View style={[styles.mapLoading, { height: 200 }]}>
                  <ActivityIndicator size="small" color="#4F46E5" />
                  <Text style={styles.mapLoadingText}>Mengambil GPS awal...</Text>
                </View>
              ) : (
                <View style={styles.mapContainer}>
                  <WebView
                    ref={pickerWebViewRef}
                    originWhitelist={['*']}
                    source={{ html: pickerMapHtml }}
                    onMessage={handleWebMessage}
                    style={styles.pickerMap}
                    javaScriptEnabled={true}
                    domStorageEnabled={true}
                  />
                </View>
              )}

              <Text style={styles.coordsText}>
                📌 Koordinat: {latitude.toFixed(6)}, {longitude.toFixed(6)}
              </Text>

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.btnCancel]}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={styles.btnCancelText}>Batal</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.btnSave]}
                  onPress={handleCreateMeetup}
                >
                  <Text style={styles.btnSaveText}>Simpan</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  glowTop: {
    position: 'absolute',
    top: -150,
    left: -50,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: '#EEF2FF',
    opacity: 0.8,
    zIndex: -1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 0,
    top: -20,
    paddingBottom: 4,
  },
  headerProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1.5,
    borderColor: '#E0E7FF',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  avatarText: {
    fontSize: 20,
  },
  headerProfileTextContainer: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  editProfileIcon: {
    fontSize: 12,
    marginLeft: 6,
    color: '#4F46E5',
    opacity: 0.8,
  },
  welcomeText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '600',
  },
  userEmailText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  btnLogout: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  btnLogoutText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#EF4444',
  },
  titleContainer: {
    paddingHorizontal: 24,
    marginBottom: 16,
    marginTop: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleIcon: {
    fontSize: 28,
    marginRight: 10,
  },
  titleText: {
    fontSize: 26,
    fontWeight: '850',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  subTitleText: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
    marginTop: 4,
  },
  listContainer: {
    paddingHorizontal: 24,
    paddingBottom: 100,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  loaderText: {
    marginTop: 10,
    color: '#64748B',
    fontSize: 14,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardHeaderIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardEmoji: {
    fontSize: 22,
  },
  cardHeaderText: {
    flex: 1,
  },
  cardTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    flex: 0.75,
  },
  btnDelete: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#FEF2F2',
    borderWidth: 0.5,
    borderColor: '#FEE2E2',
  },
  btnDeleteText: {
    fontSize: 11,
    color: '#EF4444',
    fontWeight: '700',
  },
  cardTime: {
    fontSize: 12,
    color: '#4F46E5',
    fontWeight: '600',
    marginTop: 2,
  },
  cardDesc: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
    marginVertical: 12,
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 4,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  locationContainer: {
    flex: 0.45,
  },
  cardAddress: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  actionsContainer: {
    flex: 0.55,
    alignItems: 'flex-end',
  },
  participantActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  btnJoin: {
    backgroundColor: '#10B981', // Hijau emerald premium
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  btnJoinText: {
    color: '#FFFFFF',
    fontWeight: '750',
    fontSize: 12,
  },
  btnLeave: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginRight: 8,
    borderRadius: 10,
    backgroundColor: '#FFF1F2',
    borderWidth: 0.5,
    borderColor: '#FFE4E6',
  },
  btnLeaveText: {
    color: '#F43F5E',
    fontWeight: '700',
    fontSize: 12,
  },
  btnDetail: {
    backgroundColor: '#4F46E5',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  btnDetailText: {
    color: '#FFFFFF',
    fontWeight: '750',
    fontSize: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyIcon: {
    fontSize: 54,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#334155',
  },
  emptySubText: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 6,
  },
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 30,
    backgroundColor: '#4F46E5',
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 32,
    lineHeight: 34,
    fontWeight: '300',
  },
  modalBg: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
  },
  modalBgCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    padding: 24,
  },
  profileModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 10,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    height: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
  },
  modalHeaderBar: {
    width: 40,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '850',
    color: '#0F172A',
    textAlign: 'center',
  },
  modalSubTitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
    lineHeight: 18,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  flexItem: {
    flex: 1,
  },
  inputWrapper: {
    marginBottom: 10,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputCompact: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#0F172A',
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
    color: '#0F172A',
  },
  datePickerButton: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  datePickerButtonText: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '550',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderWidth: 1.5,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#0F172A',
  },
  btnSearch: {
    backgroundColor: '#4F46E5',
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 9.5,
    justifyContent: 'center',
    alignItems: 'center',
    borderColor: '#4F46E5',
    borderWidth: 1.5,
  },
  btnSearchText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  mapLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  mapContainer: {
    height: 200,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 8,
    borderColor: '#E2E8F0',
    borderWidth: 1.5,
  },
  pickerMap: {
    flex: 1,
  },
  mapLoading: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
  },
  mapLoadingText: {
    marginTop: 6,
    color: '#64748B',
    fontSize: 12,
  },
  coordsText: {
    fontSize: 11,
    color: '#4F46E5',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 16,
  },
  modalBtn: {
    flex: 0.48,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnCancel: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  btnCancelText: {
    fontWeight: '700',
    fontSize: 14,
    color: '#64748B',
  },
  btnSave: {
    backgroundColor: '#10B981',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  btnSaveText: {
    fontWeight: '700',
    fontSize: 14,
    color: '#FFFFFF',
  },
  // Style Tambahan untuk Pencarian, Filter, dan Alert
  listSearchFilterContainer: {
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  listSearchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  listSearchIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  listSearchInputField: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
    padding: 0,
  },
  listClearSearchIcon: {
    fontSize: 14,
    color: '#64748B',
    marginLeft: 6,
  },
  listFilterTabs: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 3,
  },
  listFilterTab: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 8,
  },
  listFilterTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  listFilterTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  listFilterTabTextActive: {
    color: '#4F46E5',
    fontWeight: '700',
  },
  upcomingAlertBanner: {
    backgroundColor: '#EEF2FF',
    marginHorizontal: 20,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    marginBottom: 12,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
  },
  upcomingAlertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  upcomingAlertLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  upcomingAlertIcon: {
    fontSize: 22,
    marginRight: 10,
  },
  upcomingAlertTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#312E81',
  },
  upcomingAlertDesc: {
    fontSize: 11,
    color: '#4338CA',
    marginTop: 1,
    width: '90%',
  },
  upcomingAlertArrow: {
    fontSize: 12,
    color: '#4F46E5',
  },
  badgeRow: {
    flexDirection: 'row',
    marginTop: 6,
    alignItems: 'center',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
});
