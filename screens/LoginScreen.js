import { useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { supabase } from '../lib/supabase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Error States
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');
  const [generalError, setGeneralError] = useState('');

  // Shake Animation Value
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // Efek Wobble/Shake Animasi saat input salah
  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 12, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -12, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 4, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -4, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  // Mengubah tab dan mereset field sandi & error
  function switchTab(registerMode) {
    setIsRegisterMode(registerMode);
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
    
    // Reset errors
    setEmailError('');
    setPasswordError('');
    setConfirmPasswordError('');
    setGeneralError('');
  }

  async function handleAuth() {
    // Reset errors
    setEmailError('');
    setPasswordError('');
    setConfirmPasswordError('');
    setGeneralError('');

    let hasValidationError = false;

    if (!email) {
      setEmailError('Email tidak boleh kosong.');
      hasValidationError = true;
    }
    
    if (!password) {
      setPasswordError('Password tidak boleh kosong.');
      hasValidationError = true;
    } else if (password.length < 6) {
      setPasswordError('Password harus minimal 6 karakter.');
      hasValidationError = true;
    }

    if (isRegisterMode) {
      if (!confirmPassword) {
        setConfirmPasswordError('Konfirmasi password tidak boleh kosong.');
        hasValidationError = true;
      } else if (password !== confirmPassword) {
        setConfirmPasswordError('Password dan Konfirmasi Password tidak cocok.');
        hasValidationError = true;
      }
    }

    if (hasValidationError) {
      triggerShake();
      return;
    }

    setLoading(true);
    
    if (isRegisterMode) {
      // REGISTER
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        setGeneralError(error.message);
        triggerShake();
        setLoading(false);
      } else {
        Alert.alert(
          'Registrasi Sukses!', 
          'Akun berhasil dibuat. Silakan cek email Anda untuk verifikasi jika aktif.'
        );
        setLoading(false);
        switchTab(false); // Arahkan ke tab login setelah sukses register
      }
    } else {
      // LOGIN
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setGeneralError(
          error.message === 'Invalid login credentials'
            ? 'Email atau password salah. Silakan coba lagi.'
            : error.message
        );
        triggerShake();
        setLoading(false);
      }
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        {/* Glow decoration */}
        <View style={styles.glowTop} />
        
        {/* Header Logo */}
        <View style={styles.header}>
          <Text style={styles.logoIcon}>📍</Text>
          <Text style={styles.logoText}>KumpulKuy</Text>
          <Text style={styles.logoSubText}>Lacak & Kumpul Bareng Teman Jadi Lebih Mudah</Text>
        </View>

        {/* Tab Selector */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, !isRegisterMode && styles.activeTab]}
            onPress={() => switchTab(false)}
          >
            <Text style={[styles.tabText, !isRegisterMode && styles.activeTabText]}>🔑 Masuk</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, isRegisterMode && styles.activeTab]}
            onPress={() => switchTab(true)}
          >
            <Text style={[styles.tabText, isRegisterMode && styles.activeTabText]}>📝 Daftar</Text>
          </TouchableOpacity>
        </View>

        {/* Form Card (Shakes on validation error) */}
        <Animated.View style={[styles.card, { transform: [{ translateX: shakeAnim }] }]}>
          <Text style={styles.formTitle}>
            {isRegisterMode ? 'Buat Akun Baru' : 'Selamat Datang Kembali'}
          </Text>
          <Text style={styles.formSubTitle}>
            {isRegisterMode 
              ? 'Mulai buat meetup dan lacak teman perjalanan Anda secara instan.' 
              : 'Silakan masuk ke akun KumpulKuy Anda.'}
          </Text>

          {/* General Error Banner */}
          {!!generalError && (
            <View style={styles.generalErrorCard}>
              <Text style={styles.generalErrorText}>⚠️ {generalError}</Text>
            </View>
          )}

          {/* Email Input */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Email</Text>
            <TextInput
              style={[styles.input, !!emailError && styles.inputError]}
              placeholder="nama@email.com"
              placeholderTextColor="#94A3B8"
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                setEmailError('');
                setGeneralError('');
              }}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            {!!emailError && <Text style={styles.errorText}>{emailError}</Text>}
          </View>

          {/* Password Input */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Password</Text>
            <View style={[styles.passwordWrapper, !!passwordError && styles.inputError]}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Minimal 6 karakter"
                placeholderTextColor="#94A3B8"
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  setPasswordError('');
                  setGeneralError('');
                }}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword(!showPassword)}
                activeOpacity={0.7}
              >
                <Text style={styles.eyeIcon}>{showPassword ? '👁️' : '🙈'}</Text>
              </TouchableOpacity>
            </View>
            {!!passwordError && <Text style={styles.errorText}>{passwordError}</Text>}
          </View>

          {/* Confirm Password Input (Register Mode Only) */}
          {isRegisterMode && (
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Konfirmasi Password</Text>
              <View style={[styles.passwordWrapper, !!confirmPasswordError && styles.inputError]}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Ulangi password Anda"
                  placeholderTextColor="#94A3B8"
                  value={confirmPassword}
                  onChangeText={(text) => {
                    setConfirmPassword(text);
                    setConfirmPasswordError('');
                    setGeneralError('');
                  }}
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={styles.eyeButton}
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.eyeIcon}>{showConfirmPassword ? '👁️' : '🙈'}</Text>
                </TouchableOpacity>
              </View>
              {!!confirmPasswordError && <Text style={styles.errorText}>{confirmPasswordError}</Text>}
            </View>
          )}

          {loading ? (
            <View style={styles.loaderContainer}>
              <ActivityIndicator size="large" color="#6366F1" />
              <Text style={styles.loaderText}>Memproses autentikasi...</Text>
            </View>
          ) : (
            <TouchableOpacity style={styles.btnPrimary} onPress={handleAuth}>
              <Text style={styles.btnPrimaryText}>
                {isRegisterMode ? '📝 Daftar Sekarang' : '🔑 Masuk Sekarang'}
              </Text>
            </TouchableOpacity>
          )}
        </Animated.View>

        {/* Toggle Footer Link */}
        <TouchableOpacity 
          style={styles.toggleFooter} 
          onPress={() => switchTab(!isRegisterMode)}
        >
          <Text style={styles.toggleFooterText}>
            {isRegisterMode ? 'Sudah punya akun? ' : 'Belum punya akun? '}
            <Text style={styles.toggleFooterTextBold}>
              {isRegisterMode ? '🔑 Masuk' : '📝 Daftar Akun'}
            </Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  glowTop: {
    position: 'absolute',
    top: -100,
    right: -50,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: '#EEF2FF',
    opacity: 0.8,
    zIndex: -1,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoIcon: {
    fontSize: 48,
    marginBottom: 10,
  },
  logoText: {
    fontSize: 32,
    fontWeight: '800',
    color: '#1E1B4B',
    letterSpacing: -0.5,
  },
  logoSubText: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 20,
    lineHeight: 20,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748B',
  },
  activeTabText: {
    color: '#4F46E5',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 15,
    elevation: 3,
  },
  formTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
  },
  formSubTitle: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 24,
    lineHeight: 18,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0F172A',
  },
  passwordWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderWidth: 1.5,
    borderRadius: 12,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0F172A',
  },
  eyeButton: {
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eyeIcon: {
    fontSize: 18,
  },
  btnPrimary: {
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  btnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  loaderContainer: {
    alignItems: 'center',
    marginTop: 10,
  },
  loaderText: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 8,
  },
  toggleFooter: {
    alignItems: 'center',
    marginTop: 24,
  },
  toggleFooterText: {
    fontSize: 14,
    color: '#64748B',
  },
  toggleFooterTextBold: {
    color: '#4F46E5',
    fontWeight: '700',
  },
  inputError: {
    borderColor: '#EF4444',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
    marginLeft: 4,
  },
  generalErrorCard: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  generalErrorText: {
    color: '#991B1B',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});
