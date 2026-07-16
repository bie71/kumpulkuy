import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { supabase } from './lib/supabase';

import LoginScreen from './screens/LoginScreen';
import RoomListScreen from './screens/RoomListScreen';
import DetailScreen from './screens/DetailScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Ambil sesi awal dari AsyncStorage saat aplikasi pertama kali dibuka
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
      SplashScreen.hideAsync().catch(() => {});
    }).catch(err => {
      console.log('Error getting supabase session:', err);
      setLoading(false);
      SplashScreen.hideAsync().catch(() => {});
    });

    // 2. Dengarkan setiap perubahan status autentikasi (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
      SplashScreen.hideAsync().catch(() => {});
    });

    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, []);

  // Tampilkan loading spinner saat memeriksa status login awal
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator>
          {session ? (
            // Halaman yang butuh login
            <>
              <Stack.Screen 
                name="RoomList" 
                component={RoomListScreen} 
                options={{ title: 'Daftar Meetup' }}
              />
              <Stack.Screen 
                name="Detail" 
                component={DetailScreen} 
                options={{ title: 'Peta KumpulKuy' }}
              />
            </>
          ) : (
            // Halaman autentikasi
            <Stack.Screen 
              name="Login" 
              component={LoginScreen} 
              options={{ headerShown: false }}
            />
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
