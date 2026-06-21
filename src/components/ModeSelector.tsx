import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import LottieView from 'lottie-react-native';
import { AntiSicknessMode } from '../hooks/useAntiSickness';

const { width } = Dimensions.get('window');

interface ModeSelectorProps {
  selectedMode: AntiSicknessMode;
  onSelectMode: (mode: AntiSicknessMode) => void;
}

interface ModeConfig {
  key: AntiSicknessMode;
  title: string;
  description: string;
  animation: any;
}

const modes: ModeConfig[] = [
  {
    key: 'shake',
    title: '摇一摇',
    description: '晃动手机，缓解晕车',
    animation: require('../assets/shake.json'),
  },
  {
    key: 'swipe',
    title: '滑一滑',
    description: '滑动屏幕，跟随引导',
    animation: require('../assets/swipe.json'),
  },
  {
    key: 'twist',
    title: '转一转',
    description: '多角度转动，降低不适',
    animation: require('../assets/twist.json'),
  },
  {
    key: 'auto',
    title: '智能模式',
    description: '自动检测，推荐练习',
    animation: null,
  },
];

export const ModeSelector: React.FC<ModeSelectorProps> = ({ selectedMode, onSelectMode }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>选择练习模式</Text>
      <View style={styles.grid}>
        {modes.map((mode) => (
          <TouchableOpacity
            key={mode.key}
            style={[
              styles.card,
              selectedMode === mode.key && styles.cardSelected,
            ]}
            onPress={() => onSelectMode(mode.key)}
            activeOpacity={0.8}
          >
            <View style={styles.iconContainer}>
              {mode.animation ? (
                <LottieView
                  source={mode.animation}
                  autoPlay
                  loop
                  style={styles.modeIcon}
                />
              ) : (
                <Text style={styles.autoIcon}>✨</Text>
              )}
            </View>
            <Text style={styles.cardTitle}>{mode.title}</Text>
            <Text style={styles.cardDesc}>{mode.description}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 15,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  card: {
    width: (width - 60) / 2,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    marginBottom: 15,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  cardSelected: {
    borderWidth: 2,
    borderColor: '#6366F1',
    shadowColor: '#6366F1',
    shadowOpacity: 0.3,
  },
  iconContainer: {
    width: 80,
    height: 80,
    marginBottom: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modeIcon: {
    width: 70,
    height: 70,
  },
  autoIcon: {
    fontSize: 40,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
  },
});