import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Dimensions,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    Share,
    Modal,
    Image,
} from 'react-native';
import * as Linking from 'expo-linking';
import { WebView } from 'react-native-webview';
import { supabase } from '../lib/supabase';

export default function DetailScreen({ route, navigation }) {
  const { meetup } = route.params;

  const [myLocation, setMyLocation] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [participants, setParticipants] = useState([]);
  
  // Chat & Tabs States
  const [activeTab, setActiveTab] = useState('info'); // 'info' atau 'chat'
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [participantsList, setParticipantsList] = useState([]); // menyimpan data partisipan + last_read_at
  const [myProfileName, setMyProfileName] = useState('Anda');
  const [webReady, setWebReady] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPanelMinimized, setIsPanelMinimized] = useState(false);

  // States baru untuk Notifikasi & Pengingat
  const [notification, setNotification] = useState(null);
  const [reminder, setReminder] = useState(null);
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const bannerAnim = useRef(new Animated.Value(-120)).current;

  const locationSubscription = useRef(null);
  const webViewRef = useRef(null);
  const scrollViewRef = useRef(null);

  const shareUrl = Linking.createURL('join-meetup', {
    queryParams: { id: meetup.id },
  });

  async function handleShareLink() {
    try {
      const message = `Yuk gabung ke acara meetup "${meetup.title}" di "${meetup.destination_address}"!\n\nKlik tautan ini untuk langsung bergabung dan melacak posisi kami secara real-time:\n${shareUrl}`;
      await Share.share({
        message,
        title: `Undangan Meetup: ${meetup.title}`,
      });
    } catch (error) {
      console.log('Error sharing meetup link:', error.message);
    }
  }

  // Refs untuk mencegah stale closure di realtime subscription
  const currentUserIdRef = useRef(null);
  const participantsRef = useRef([]);
  const activeTabRef = useRef('info');

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  // Trigger Banner Notifikasi Obrolan dalam aplikasi
  function showNotificationBanner(title, body) {
    setNotification({ title, body });
    Animated.sequence([
      Animated.timing(bannerAnim, {
        toValue: 40,
        duration: 350,
        useNativeDriver: true,
      }),
      Animated.delay(4000),
      Animated.timing(bannerAnim, {
        toValue: -120,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setNotification(null);
    });
  }

  useEffect(() => {
    // 1. Inisialisasi pelacakan lokasi & fetch data awal
    startLocationTracking();
    fetchParticipantsLocations();
    fetchMessages();
    fetchParticipants();

    // 2. Pengecekan Pengingat Waktu Meetup
    const scheduledTime = new Date(meetup.scheduled_at).getTime();
    const now = new Date().getTime();
    const diffMs = scheduledTime - now;

    if (diffMs > 0) {
      const diffHours = diffMs / (1000 * 60 * 60);
      if (diffHours <= 24) {
        if (diffHours < 1) {
          const diffMins = Math.round(diffMs / (1000 * 60));
          setReminder(`Acara dimulai dalam ${diffMins} menit lagi!`);
        } else {
          const diffHoursRound = Math.round(diffHours);
          setReminder(`Acara dimulai dalam ${diffHoursRound} jam lagi!`);
        }
      }
    }

    // 3. Langganan Supabase Realtime
    const channel = supabase
      .channel(`meetup-channel-${meetup.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_locations',
          filter: `meetup_id=eq.${meetup.id}`,
        },
        (payload) => {
          fetchParticipantsLocations();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'meetup_messages',
          filter: `meetup_id=eq.${meetup.id}`,
        },
        (payload) => {
          fetchMessages();
          if (activeTabRef.current === 'chat') {
            markChatAsRead();
          } else {
            const senderId = payload.new.user_id;
            if (senderId !== currentUserIdRef.current) {
              const sender = participantsRef.current.find(p => p.user_id === senderId);
              const senderName = sender?.profiles?.full_name || sender?.profiles?.username || 'Kawan Kumpul';
              showNotificationBanner(senderName, payload.new.message);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'meetup_participants',
          filter: `meetup_id=eq.${meetup.id}`,
        },
        (payload) => {
          fetchParticipants();
        }
      )
      .subscribe();

    return () => {
      // Cleanup
      if (locationSubscription.current) {
        locationSubscription.current.remove();
      }
      supabase.removeChannel(channel);
    };
  }, []);

  // Tandai pesan dibaca saat pengguna masuk/berpindah ke tab chat
  useEffect(() => {
    if (activeTab === 'chat') {
      markChatAsRead();
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 200);
    }
  }, [activeTab]);

  // Auto-scroll ke bawah saat ada pesan baru masuk
  useEffect(() => {
    if (activeTab === 'chat') {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages]);

  // Setiap kali data koordinat peserta berubah atau peta siap, kirimkan koordinat baru ke Leaflet WebView
  useEffect(() => {
    if (webViewRef.current && webReady && (participants.length > 0 || myLocation)) {
      sendLocationsToWeb();
    }
  }, [participants, myLocation, currentUserId, myProfileName, webReady]);

  function sendLocationsToWeb() {
    let list = [...participants];

    // Gabungkan lokasi saya sendiri secara lokal agar instan tampil di peta
    const hasMe = list.some((p) => p.user_id === currentUserId);
    if (!hasMe && myLocation && currentUserId) {
      list.push({
        user_id: currentUserId,
        latitude: myLocation.latitude,
        longitude: myLocation.longitude,
        profiles: {
          full_name: myProfileName,
          username: 'Me'
        }
      });
    }

    const dataToSend = list.map((p) => {
      const isMe = currentUserId && p.user_id === currentUserId;
      return {
        user_id: p.user_id,
        latitude: p.latitude,
        longitude: p.longitude,
        username: p.profiles?.full_name || p.profiles?.username || 'Teman',
        isMe: !!isMe,
      };
    });

    // 1. Kirim via postMessage (untuk kompatibilitas)
    webViewRef.current.postMessage(
      JSON.stringify({
        type: 'UPDATE_PARTICIPANTS',
        data: dataToSend,
      })
    );

    // 2. Kirim via direct JavaScript injection (sangat andal)
    const runJS = `
      if (window.updateParticipants) {
        window.updateParticipants(${JSON.stringify(dataToSend)});
      }
      true;
    `;
    webViewRef.current.injectJavaScript(runJS);
  }

  // Fungsi menghitung jarak Haversine (dalam km) antara dua titik koordinat
  function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius bumi dalam km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2)
      ; 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    const d = R * c; 
    return d;
  }

  // Kamera fokus pada lokasi pengguna sendiri
  function focusOnMe() {
    if (webViewRef.current && myLocation) {
      const runJS = `
        if (window.focusOnMe) {
          window.focusOnMe();
        }
        true;
      `;
      webViewRef.current.injectJavaScript(runJS);
    } else {
      Alert.alert('GPS Belum Siap', 'Lokasi Anda belum terlacak.');
    }
  }

  // Kamera fokus pada tujuan meetup (Pin Merah)
  function focusOnDest() {
    if (webViewRef.current) {
      const runJS = `
        if (window.focusOnDest) {
          window.focusOnDest();
        }
        true;
      `;
      webViewRef.current.injectJavaScript(runJS);
    }
  }

  // Kamera fitBounds memperlihatkan seluruh pin di layar
  function fitAllMarkers() {
    if (webViewRef.current) {
      const runJS = `
        if (window.fitAllMarkers) {
          window.fitAllMarkers();
        }
        true;
      `;
      webViewRef.current.injectJavaScript(runJS);
    }
  }

  // Ambil data lokasi semua peserta meetup
  async function fetchParticipantsLocations() {
    setIsRefreshing(true);

    // 1. Ambil lokasi saya sendiri secara paksa (instan)
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      if (loc && loc.coords) {
        setMyLocation(loc.coords);
        
        // Simpan ke Supabase jika currentUserId tersedia
        if (currentUserId) {
          await supabase.from('user_locations').upsert({
            user_id: currentUserId,
            meetup_id: meetup.id,
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            updated_at: new Date().toISOString(),
          });
        }
      }
    } catch (e) {
      console.log('Error getting current location on refresh:', e.message);
    }

    // 2. Ambil lokasi teman-teman dari Supabase
    const { data, error } = await supabase
      .from('user_locations')
      .select('*, profiles(username, full_name)')
      .eq('meetup_id', meetup.id);

    setIsRefreshing(false);

    if (error) {
      console.log('Error fetching participants locations:', error.message);
    } else {
      setParticipants(data || []);
      // Auto fit bounds agar penanda terupdate terlihat
      setTimeout(() => {
        fitAllMarkers();
      }, 350);
    }
  }

  // Ambil data riwayat chat grup meetup
  async function fetchMessages() {
    const { data, error } = await supabase
      .from('meetup_messages')
      .select('*, profiles(username, full_name)')
      .eq('meetup_id', meetup.id)
      .order('created_at', { ascending: true });

    if (error) {
      console.log('Error fetching messages:', error.message);
    } else {
      setMessages(data || []);
    }
  }

  // Ambil data daftar partisipan beserta last_read_at
  async function fetchParticipants() {
    const { data, error } = await supabase
      .from('meetup_participants')
      .select('*, profiles(username, full_name)')
      .eq('meetup_id', meetup.id);

    if (error) {
      console.log('Error fetching participants list:', error.message);
    } else {
      setParticipantsList(data || []);
    }
  }

  // Memperbarui waktu baca terakhir pengguna (last_read_at)
  async function markChatAsRead() {
    if (!currentUserId) return;
    try {
      const { error } = await supabase
        .from('meetup_participants')
        .update({ last_read_at: new Date().toISOString() })
        .eq('meetup_id', meetup.id)
        .eq('user_id', currentUserId);

      if (error) {
        console.log('Error updating last_read_at:', error.message);
      }
    } catch (err) {
      console.log('Error marking chat as read:', err.message);
    }
  }

  // Mengirim pesan baru ke grup
  async function handleSendMessage() {
    if (!inputText.trim()) return;
    const textToSend = inputText.trim();
    setInputText('');

    try {
      const { error } = await supabase
        .from('meetup_messages')
        .insert({
          meetup_id: meetup.id,
          user_id: currentUserId,
          message: textToSend,
        });

      if (error) {
        Alert.alert('Gagal Mengirim', error.message);
      } else {
        await markChatAsRead();
        fetchMessages();
      }
    } catch (err) {
      console.log('Error sending message:', err.message);
    }
  }

  // Mendapatkan indikator dibaca (Read Indicator)
  const getMessageReadStatus = (msg) => {
    if (msg.user_id !== currentUserId) return null; // Hanya tampil di pesan milik sendiri

    // Cari partisipan lain (selain pengirim) yang last_read_at >= msg.created_at
    const readers = participantsList
      .filter(
        (p) =>
          p.user_id !== currentUserId &&
          p.last_read_at &&
          new Date(p.last_read_at) >= new Date(msg.created_at)
      )
      .map((p) => p.profiles?.full_name || p.profiles?.username || 'Teman');

    if (readers.length > 0) {
      return {
        read: true,
        text: `✓✓ Dibaca oleh: ${readers.join(', ')}`,
      };
    }
    return {
      read: false,
      text: '✓ Terkirim',
    };
  };

  // Mulai memantau lokasi perangkat pengguna sendiri
  async function startLocationTracking() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);

        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, username')
          .eq('id', user.id)
          .single();
        if (profile) {
          setMyProfileName(profile.full_name || profile.username || 'Anda');
        } else {
          setMyProfileName(user.email.split('@')[0]);
        }
      }

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Izin Ditolak',
          'Aplikasi membutuhkan izin lokasi untuk melacak koordinat Anda di peta.'
        );
        setLoading(false);
        return;
      }

      // 1. Coba dapatkan lokasi terakhir dari cache (instan & tidak memblokir)
      let initialLoc = await Location.getLastKnownPositionAsync();
      if (initialLoc && initialLoc.coords) {
        setMyLocation(initialLoc.coords);
        updateLocationInSupabase(initialLoc.coords, user?.id);
      }

      // Hilangkan status loading utama secepatnya setelah penanganan lokasi awal
      setLoading(false);

      // 2. Minta pembaruan lokasi baru secara asinkron di latar belakang (tidak memblokir thread UI)
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }).then((loc) => {
        if (loc && loc.coords) {
          setMyLocation(loc.coords);
          updateLocationInSupabase(loc.coords, user?.id);
        }
      }).catch((e) => {
        console.log('Error getting current location async on mount:', e.message);
      });

      // 3. Langganan koordinat GPS secara real-time
      locationSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 10000,
          distanceInterval: 10,
        },
        (newLoc) => {
          if (newLoc && newLoc.coords) {
            setMyLocation(newLoc.coords);
            updateLocationInSupabase(newLoc.coords, user?.id);
          }
        }
      );
    } catch (err) {
      console.log('Error in startLocationTracking:', err.message);
      setLoading(false);
    }
  }

  // Update lokasi di Supabase
  async function updateLocationInSupabase(coords, userId) {
    try {
      const activeUid = userId || currentUserId;
      if (!activeUid) return;

      const { error } = await supabase
        .from('user_locations')
        .upsert({
          meetup_id: meetup.id,
          user_id: activeUid,
          latitude: coords.latitude,
          longitude: coords.longitude,
          updated_at: new Date().toISOString(),
        });

      if (error) {
        console.log('Error upserting location:', error.message);
      } else {
        // Tarik lokasi ter-update ke layar lokal instan
        fetchParticipantsLocations();
      }
    } catch (err) {
      console.log('Error updating location:', err.message);
    }
  }

  // Handler pesan masuk dari WebView Leaflet
  function handleWebMessage(e) {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === 'MAP_READY') {
        setWebReady(true); // Peta selesai loading & siap menerima koordinat
      }
    } catch (err) {
      console.log('Error parsing web message:', err.message);
    }
  }

  const detailMapHtml = `
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
          .custom-pin {
            filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
          }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          const map = L.map('map', { zoomControl: false }).setView([${meetup.destination_lat}, ${meetup.destination_lng}], 15);
          
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap'
          }).addTo(map);

          // Marker tujuan meetup dengan HTML kustom
          const destIconHtml = '<div style="background-color: #EF4444; width: 18px; height: 18px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 6px rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center;"><div style="background-color: white; width: 6px; height: 6px; border-radius: 50%;"></div></div>';
          const destIcon = L.divIcon({
            html: destIconHtml,
            className: 'custom-pin',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
          });
          const destMarker = L.marker([${meetup.destination_lat}, ${meetup.destination_lng}], { icon: destIcon }).addTo(map);
          destMarker.bindPopup("<b>Tujuan: ${meetup.title}</b><br>${meetup.destination_address}").openPopup();

          const markers = {};
          let initialFit = false;
          let myId = null;
          let routeLine = null;

          // Menggambar garis rute berkendara dari OSRM
          function drawRoute(myLat, myLng) {
            const url = 'https://router.project-osrm.org/route/v1/driving/' + myLng + ',' + myLat + ';' + ${meetup.destination_lng} + ',' + ${meetup.destination_lat} + '?overview=full&geometries=geojson';
            
            fetch(url)
              .then(function(res) { return res.json(); })
              .then(function(data) {
                if (data.routes && data.routes.length > 0) {
                  const coords = data.routes[0].geometry.coordinates;
                  const latLngs = coords.map(function(c) { return [c[1], c[0]]; });

                  if (routeLine) {
                    map.removeLayer(routeLine);
                  }

                  // Garis rute berwarna Indigo dengan animasi dashed premium
                  routeLine = L.polyline(latLngs, {
                    color: '#6366F1',
                    weight: 5,
                    opacity: 0.8,
                    dashArray: '4, 8'
                  }).addTo(map);
                }
              })
              .catch(function(err) {
                console.log("Error fetching route:", err.message);
              });
          }

          // Fungsi global yang dapat dipanggil langsung via injectJavaScript
          window.updateParticipants = function(list) {
            const activeIds = list.map(function(item) { return item.user_id; });

            // Hapus penanda peserta yang sudah tidak aktif
            for (const id in markers) {
              if (!activeIds.includes(id)) {
                map.removeLayer(markers[id]);
                delete markers[id];
              }
            }

            // Tambah / update koordinat penanda
            list.forEach(function(item) {
              const color = item.isMe ? '#007AFF' : '#34C759';
              const pinHtml = '<div style="background-color: ' + color + '; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.4);"></div>';
              
              const customIcon = L.divIcon({
                html: pinHtml,
                className: 'custom-pin',
                iconSize: [18, 18],
                iconAnchor: [9, 9]
              });

              const title = item.isMe ? 'Anda di sini' : item.username;

              if (markers[item.user_id]) {
                markers[item.user_id].setLatLng([item.latitude, item.longitude]);
              } else {
                markers[item.user_id] = L.marker([item.latitude, item.longitude], { icon: customIcon }).addTo(map);
              }
              markers[item.user_id].bindPopup("<b>" + title + "</b>");

              if (item.isMe) {
                myId = item.user_id;
                // Gambar rute lokal
                drawRoute(item.latitude, item.longitude);
              }
            });

            // Otomatis atur posisi kamera peta agar semua pin (tujuan + lokasi pengguna) terlihat di layar pertama kali
            if (!initialFit && list.length > 0) {
              window.fitAllMarkers();
              initialFit = true;
            }
          };

          // Aksi fokus kamera peta
          window.focusOnMe = function() {
            if (myId && markers[myId]) {
              map.setView(markers[myId].getLatLng(), 16);
              markers[myId].openPopup();
            }
          };

          window.focusOnDest = function() {
            map.setView(destMarker.getLatLng(), 16);
            destMarker.openPopup();
          };

          window.fitAllMarkers = function() {
            const allMarkers = Object.values(markers).concat(destMarker);
            if (allMarkers.length > 0) {
              const group = L.featureGroup(allMarkers);
              map.fitBounds(group.getBounds().pad(0.20), { maxZoom: 16 });
            }
          };

          // Beritahu React Native bahwa peta sudah siap secara aman (polling jika jembatan belum siap)
          function notifyReady() {
            if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'MAP_READY' }));
            } else {
              setTimeout(notifyReady, 50);
            }
          }
          notifyReady();

          // Handler penerimaan pesan untuk kompatibilitas postMessage (mendengarkan di window dan document)
          function handleIncomingMessage(e) {
            try {
              const msg = JSON.parse(e.data);
              if (msg.type === 'UPDATE_PARTICIPANTS') {
                window.updateParticipants(msg.data);
              }
            } catch (err) {
              // Abaikan jika pesan bukan format JSON yang sesuai
            }
          }
          window.addEventListener('message', handleIncomingMessage);
          document.addEventListener('message', handleIncomingMessage);
        </script>
      </body>
    </html>
  `;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4F46E5" />
        <Text style={styles.loadingText}>Menyiapkan peta & GPS...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* In-App Notification Banner */}
      {notification && (
        <Animated.View style={[styles.notificationBanner, { transform: [{ translateY: bannerAnim }] }]}>
          <TouchableOpacity 
            style={styles.notificationContent} 
            activeOpacity={0.9}
            onPress={() => {
              setActiveTab('chat');
              // Sembunyikan banner
              Animated.timing(bannerAnim, {
                toValue: -120,
                duration: 200,
                useNativeDriver: true,
              }).start(() => setNotification(null));
            }}
          >
            <View style={styles.notificationTextContainer}>
              <Text style={styles.notificationTitle}>💬 Pesan Baru: {notification.title}</Text>
              <Text style={styles.notificationBody} numberOfLines={1}>{notification.body}</Text>
            </View>
            <Text style={styles.notificationAction}>Balas ➔</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: detailMapHtml }}
        style={styles.map}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        onMessage={handleWebMessage} // Daftarkan handler komunikasi WebView
      />

      {/* Floating Map Controls (Right Side) */}
      <View style={styles.mapControlsContainer}>
        <TouchableOpacity style={styles.mapControlBtn} onPress={focusOnMe}>
          <Text style={styles.mapControlIcon}>🎯</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.mapControlBtn} onPress={focusOnDest}>
          <Text style={styles.mapControlIcon}>🏁</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.mapControlBtn} onPress={fitAllMarkers}>
          <Text style={styles.mapControlIcon}>👥</Text>
        </TouchableOpacity>
      </View>

      {/* Floating Back Button (Top-Left) */}
      <View style={[styles.backButtonContainer, { top: 8 }]}>
        <TouchableOpacity style={styles.btnBack} onPress={() => navigation.goBack()}>
          <Text style={styles.btnBackText}>Back</Text>
        </TouchableOpacity>
      </View>

      {/* Slide-Up Panel */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        style={styles.keyboardWrapper}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 80}
      >
        <View style={[styles.overlayPanel, isPanelMinimized && { maxHeight: 75, paddingBottom: 8 }]}>
          <View style={styles.panelHandle} />
          
          {/* Tab Selector & Minimize Toggle */}
          <View style={styles.sheetTabBarContainer}>
            <View style={styles.sheetTabBar}>
              <TouchableOpacity 
                style={[styles.sheetTab, activeTab === 'info' && styles.sheetTabActive]}
                onPress={() => {
                  setActiveTab('info');
                  setIsPanelMinimized(false); // Buka panel jika diklik tabnya
                }}
              >
                <Text style={[styles.sheetTabText, activeTab === 'info' && styles.sheetTabTextActive]}>📍 Info & GPS</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.sheetTab, activeTab === 'chat' && styles.sheetTabActive]}
                onPress={() => {
                  setActiveTab('chat');
                  setIsPanelMinimized(false); // Buka panel jika diklik tabnya
                }}
              >
                <Text style={[styles.sheetTabText, activeTab === 'chat' && styles.sheetTabTextActive]}>💬 Chat Grup</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity 
              style={styles.btnTogglePanel}
              onPress={() => setIsPanelMinimized(!isPanelMinimized)}
              activeOpacity={0.7}
            >
              <Text style={styles.btnTogglePanelText}>{isPanelMinimized ? '🔼' : '🔽'}</Text>
            </TouchableOpacity>
          </View>

          {/* Tab Content 1: Info & GPS */}
          {!isPanelMinimized && activeTab === 'info' && (
            <ScrollView 
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 10 }}
            >
              {reminder && (
                <View style={styles.reminderBanner}>
                  <Text style={styles.reminderText}>⏰ {reminder}</Text>
                </View>
              )}

              <View style={styles.panelHeader}>
                <View style={styles.panelIconContainer}>
                  <Text style={styles.panelIcon}>📍</Text>
                </View>
                <View style={styles.panelHeaderText}>
                  <Text style={styles.meetupTitle}>{meetup.title}</Text>
                  <Text style={styles.meetupAddress}>{meetup.destination_address}</Text>
                  <Text style={styles.meetupTimeText}>
                    📅 {new Date(meetup.scheduled_at).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} pukul {new Date(meetup.scheduled_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              </View>

              <View style={styles.panelStats}>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Teman Terlacak</Text>
                  <Text style={styles.statVal}>👥 {participants.length} Aktif</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Status GPS</Text>
                  <Text style={styles.statVal}>📡 Terkoneksi</Text>
                </View>
              </View>

              {/* Daftar Peserta Terlacak Real-time */}
              <Text style={styles.listSectionTitle}>Live Jarak & Estimasi Tiba (ETA)</Text>
              {participants.length > 0 ? (
                <View style={styles.participantsLiveContainer}>
                  {participants.map((p) => {
                    const isMe = p.user_id === currentUserId;
                    const dist = getDistance(p.latitude, p.longitude, meetup.destination_lat, meetup.destination_lng);
                    const name = isMe ? 'Anda' : (p.profiles?.full_name || p.profiles?.username || 'Teman');
                    
                    let statusText = '';
                    let statusColor = '#4F46E5'; // Indigo default
                    
                    if (dist < 0.05) {
                      statusText = '📍 Sudah Tiba';
                      statusColor = '#10B981'; // Green
                    } else {
                      const etaMin = Math.round(dist / 0.5); // Kecepatan rata-rata 30 km/jam = 0.5 km/menit
                      statusText = `🚗 ${dist.toFixed(2)} km (${etaMin} mnt)`;
                    }

                    return (
                      <View key={p.user_id} style={styles.participantLiveRow}>
                        <View style={styles.nameContainer}>
                          <View style={[styles.avatarIndicator, { backgroundColor: isMe ? '#007AFF' : '#34C759' }]} />
                          <Text style={styles.participantLiveName} numberOfLines={1}>
                            {name}
                          </Text>
                        </View>
                        <Text style={[styles.participantLiveStatus, { color: statusColor }]}>
                          {statusText}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.noParticipantsBox}>
                  <Text style={styles.noParticipantsText}>Belum ada kawan kumpul yang melacak lokasi mereka.</Text>
                </View>
              )}

              {/* Share & Invite Section */}
              <View style={styles.shareSectionCard}>
                <Text style={styles.shareSectionTitle}>Undang Teman Bergabung 🤝</Text>
                <Text style={styles.shareSectionDesc}>
                  Bagikan tautan atau tunjukkan kode QR di bawah agar teman Anda dapat otomatis bergabung dan melacak perjalanan.
                </Text>
                <View style={styles.shareButtonsRow}>
                  <TouchableOpacity style={styles.btnShareLink} onPress={handleShareLink}>
                    <Text style={styles.btnShareLinkText}>🔗 Bagikan Tautan</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.btnShowQr} onPress={() => setQrModalVisible(true)}>
                    <Text style={styles.btnShowQrText}>🔍 Tampilkan QR</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity 
                style={[styles.btnAction, isRefreshing && { opacity: 0.7 }]} 
                onPress={fetchParticipantsLocations}
                disabled={isRefreshing}
              >
                {isRefreshing ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.btnActionText}>Refresh Lokasi Teman</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          )}

          {/* Tab Content 2: Chat Grup */}
          {!isPanelMinimized && activeTab === 'chat' && (
            <View style={styles.chatContainer}>
              <ScrollView 
                ref={scrollViewRef}
                style={styles.chatScroll}
                contentContainerStyle={styles.chatContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {messages.length === 0 ? (
                  <View style={styles.emptyChatContainer}>
                    <Text style={styles.emptyChatIcon}>💬</Text>
                    <Text style={styles.emptyChatText}>Belum ada pesan di grup ini.</Text>
                    <Text style={styles.emptyChatSubText}>Mulai obrolan untuk berkoordinasi titik kumpul.</Text>
                  </View>
                ) : (
                  messages.map((item) => {
                    const isMe = item.user_id === currentUserId;
                    const status = getMessageReadStatus(item);
                    const senderName = item.profiles?.full_name || item.profiles?.username || 'Teman';
                    
                    return (
                      <View 
                        key={item.id} 
                        style={[styles.messageBubbleContainer, isMe ? styles.bubbleRight : styles.bubbleLeft]}
                      >
                        {!isMe && <Text style={styles.senderLabel}>{senderName}</Text>}
                        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleFriend]}>
                          <Text style={[styles.messageText, isMe ? styles.messageTextMe : styles.messageTextFriend]}>
                            {item.message}
                          </Text>
                        </View>
                        <View style={[styles.messageFooter, isMe && { alignSelf: 'flex-end' }]}>
                          <Text style={styles.messageTime}>
                            {new Date(item.created_at).toLocaleTimeString('id-ID', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </Text>
                          {isMe && status && (
                            <Text style={[styles.readIndicator, status.read && styles.readIndicatorRead]}>
                              {status.text}
                            </Text>
                          )}
                        </View>
                      </View>
                    );
                  })
                )}
              </ScrollView>

              <View style={styles.chatInputRow}>
                <TextInput
                  style={styles.chatTextInput}
                  placeholder="Ketik pesan..."
                  placeholderTextColor="#94A3B8"
                  value={inputText}
                  onChangeText={setInputText}
                  onSubmitEditing={handleSendMessage}
                />
                <TouchableOpacity style={styles.btnSend} onPress={handleSendMessage}>
                  <Text style={styles.btnSendText}>Kirim</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          {/* Modal QR Code */}
          <Modal
            animationType="fade"
            transparent={true}
            visible={qrModalVisible}
            onRequestClose={() => setQrModalVisible(false)}
          >
            <View style={styles.modalBgCenter}>
              <View style={styles.qrModalContent}>
                <Text style={styles.qrModalTitle}>Kode QR Meetup 📅</Text>
                <Text style={styles.qrModalDesc}>Minta teman Anda memindai kode QR ini menggunakan kamera ponsel untuk langsung bergabung.</Text>
                
                <View style={styles.qrImageContainer}>
                  <Image 
                    source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(shareUrl)}` }} 
                    style={styles.qrImage}
                  />
                </View>

                <TouchableOpacity 
                  style={styles.btnQrClose}
                  onPress={() => setQrModalVisible(false)}
                >
                  <Text style={styles.btnQrCloseText}>Tutup</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  map: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingText: {
    marginTop: 12,
    color: '#64748B',
    fontSize: 14,
  },
  backButtonContainer: {
    position: 'absolute',
    left: 12,
    zIndex: 10,
  },
  btnBack: {
    width: 70,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  btnBackText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  keyboardWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  overlayPanel: {
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderRadius: 24,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 20,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    maxHeight: Dimensions.get('window').height * 0.48,
  },
  panelHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetTabBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sheetTabBar: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 3,
    flex: 1,
    marginRight: 10,
  },
  btnTogglePanel: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnTogglePanelText: {
    fontSize: 12,
  },
  sheetTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  sheetTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  sheetTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  sheetTabTextActive: {
    color: '#4F46E5',
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  panelIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  panelIcon: {
    fontSize: 20,
  },
  panelHeaderText: {
    flex: 1,
  },
  meetupTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  meetupAddress: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 18,
  },
  meetupTimeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6366F1',
    marginTop: 4,
  },
  panelStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  statBox: {
    flex: 1,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
    textTransform: 'uppercase',
  },
  statVal: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
    marginTop: 2,
  },
  btnAction: {
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  btnActionText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  
  // Chat Styles
  chatContainer: {
    height: 180,
    justifyContent: 'space-between',
  },
  chatScroll: {
    flex: 1,
    marginBottom: 8,
  },
  chatContent: {
    paddingVertical: 4,
  },
  emptyChatContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 30,
  },
  emptyChatIcon: {
    fontSize: 32,
    marginBottom: 6,
  },
  emptyChatText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  emptyChatSubText: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 2,
  },
  messageBubbleContainer: {
    marginBottom: 12,
    maxWidth: '80%',
  },
  bubbleLeft: {
    alignSelf: 'flex-start',
  },
  bubbleRight: {
    alignSelf: 'flex-end',
  },
  senderLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 3,
    marginLeft: 4,
  },
  bubble: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubbleMe: {
    backgroundColor: '#4F46E5',
    borderBottomRightRadius: 4,
  },
  bubbleFriend: {
    backgroundColor: '#F1F5F9',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 18,
  },
  messageTextMe: {
    color: '#FFFFFF',
  },
  messageTextFriend: {
    color: '#0F172A',
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  messageTime: {
    fontSize: 9,
    color: '#94A3B8',
    marginRight: 6,
  },
  readIndicator: {
    fontSize: 9,
    fontWeight: '600',
    color: '#94A3B8',
  },
  readIndicatorRead: {
    color: '#6366F1',
  },
  chatInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 8,
  },
  chatTextInput: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 14,
    color: '#0F172A',
    marginRight: 8,
  },
  btnSend: {
    backgroundColor: '#4F46E5',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnSendText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  // Map controls
  mapControlsContainer: {
    position: 'absolute',
    right: 16,
    top: Dimensions.get('window').height * 0.15,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 24,
    padding: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
    zIndex: 10,
    alignItems: 'center',
  },
  mapControlBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  mapControlIcon: {
    fontSize: 18,
  },
  // Live List styles
  listSectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
    marginTop: 6,
  },
  infoTabScroll: {
    flex: 1,
  },
  participantsLiveContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  participantLiveRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  nameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  avatarIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  participantLiveName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
    flex: 1,
  },
  participantLiveStatus: {
    fontSize: 12,
    fontWeight: '700',
  },
  noParticipantsBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  noParticipantsText: {
    color: '#64748B',
    textAlign: 'center',
  },
  // Notifikasi & Pengingat Styles
  notificationBanner: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 999,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
    borderWidth: 1.5,
    borderColor: '#EEF2FF',
  },
  notificationContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  notificationTextContainer: {
    flex: 1,
    marginRight: 12,
  },
  notificationTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#4F46E5',
    marginBottom: 2,
  },
  notificationBody: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '500',
  },
  notificationAction: {
    fontSize: 12,
    fontWeight: '800',
    color: '#6366F1',
  },
  reminderBanner: {
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    padding: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    alignItems: 'center',
  },
  reminderText: {
    fontSize: 12,
    color: '#3730A3',
    fontWeight: '700',
    textAlign: 'center',
  },
  shareSectionCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  shareSectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  shareSectionDesc: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 16,
    marginBottom: 10,
  },
  shareButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  btnShareLink: {
    flex: 0.58,
    backgroundColor: '#4F46E5',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  btnShareLinkText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  btnShowQr: {
    flex: 0.38,
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnShowQrText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '700',
  },
  modalBgCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  qrModalContent: {
    width: '80%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 5,
  },
  qrModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
  },
  qrModalDesc: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 20,
  },
  qrImageContainer: {
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#F1F5F9',
    marginBottom: 20,
  },
  qrImage: {
    width: 180,
    height: 180,
  },
  btnQrClose: {
    width: '100%',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnQrCloseText: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '700',
  },
});
