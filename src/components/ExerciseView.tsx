import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, PanResponder } from 'react-native';
import LottieView from 'lottie-react-native';
import { AntiSicknessMode } from '../hooks/useAntiSickness';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const modeAnimations: Record<AntiSicknessMode, any> = {
  shake: require('../assets/shake.json'),
  swipe: require('../assets/swipe.json'),
  twist: require('../assets/twist.json'),
  auto: require('../assets/shake.json'),
};

const modeHints: Record<AntiSicknessMode, string> = {
  shake: '请晃动手机跟随动画节奏',
  swipe: '请向右滑动屏幕跟随引导',
  twist: '请多角度转动手机',
  auto: '请跟随动画引导进行练习',
};

interface ExerciseViewProps {
  mode: AntiSicknessMode;
  exerciseCount: number;
  shakeIntensity: number;
  onStop: () => void;
  onComplete: () => void;
}

export const ExerciseView: React.FC<ExerciseViewProps> = ({
  mode,
  exerciseCount,
  shakeIntensity,
  onStop,
  onComplete,
}) => {
  const [showSuccess, setShowSuccess] = useState(false);
  const [progress, setProgress] = useState(0);
  const [swipeCount, setSwipeCount] = useState(0);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const total = 10;
    setProgress(Math.min(1, exerciseCount / total));
  }, [exerciseCount]);

  useEffect(() => {
    if (exerciseCount >= 10) {
      onComplete();
    }
  }, [exerciseCount, onComplete]);

  useEffect(() => {
    if (exerciseCount > 0 && exerciseCount % 1 === 0) {
      setShowSuccess(true);
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => setShowSuccess(false), 300);
    }
  }, [exerciseCount]);

  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => mode === 'swipe',
      onMoveShouldSetPanResponder: () => mode === 'swipe',
      onPanResponderGrant: () => {
        if (mode === 'swipe') {
          setSwipeCount(prev => prev + 1);
        }
      },
    })
  ).current;

  const renderAnimation = () => {
    if (mode === 'swipe') {
      return (
        <View style={styles.swipeContainer} {...panResponder.panHandlers}>
          <LottieView
            source={modeAnimations[mode]}
            autoPlay
            loop
            style={styles.animation}
          />
        </View>
      );
    }

    return (
      <View style={styles.animationContainer}>
        <LottieView
          source={modeAnimations[mode]}
          autoPlay
          loop
          style={styles.animation}
        />
      </View>
    );
  };

  const renderMotionTracker = () => {
    if (mode === 'shake' || mode === 'auto') {
      return (
        <View style={styles.intensitySection}>
          <Text style={styles.intensityLabel}>晃动强度</Text>
          <View style={styles.intensityBar}>
            <View style={[styles.intensityFill, { width: `${shakeIntensity * 100}%` }]} />
          </View>
        </View>
      );
    }

    return null;
  };

  return (
    <View style={styles.container}>
      <View style={styles.progressHeader}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.progressText}>
          {exerciseCount}/10
        </Text>
      </View>

      {renderAnimation()}

      <Text style={styles.hint}>{modeHints[mode]}</Text>

      {renderMotionTracker()}

      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{mode === 'shake' || mode === 'auto' ? exerciseCount : '-'}</Text>
          <Text style={styles.statLabel}>晃动次数</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{mode === 'swipe' ? swipeCount : '-'}</Text>
          <Text style={styles.statLabel}>滑动次数</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{mode === 'twist' || mode === 'auto' ? exerciseCount : '-'}</Text>
          <Text style={styles.statLabel}>旋转次数</Text>
        </View>
      </View>

      {showSuccess && (
        <View style={styles.successOverlay}>
          <View style={styles.successCheck}>
            <Text style={styles.successText}>✓</Text>
          </View>
        </View>
      )}

      <TouchableOpacity style={styles.stopButton} onPress={onStop}>
        <Text style={styles.stopButtonText}>结束练习</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 20,
    paddingHorizontal: 20,
  },
  progressHeader: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    marginRight: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#6366F1',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#6366F1',
  },
  animationContainer: {
    width: SCREEN_WIDTH * 0.6,
    height: SCREEN_WIDTH * 0.6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 20,
    marginBottom: 20,
  },
  swipeContainer: {
    width: SCREEN_WIDTH * 0.6,
    height: SCREEN_WIDTH * 0.6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 20,
    marginBottom: 20,
  },
  animation: {
    width: SCREEN_WIDTH * 0.5,
    height: SCREEN_WIDTH * 0.5,
  },
  hint: {
    fontSize: 16,
    color: '#64748B',
    marginBottom: 20,
    textAlign: 'center',
  },
  intensitySection: {
    width: '100%',
    marginBottom: 16,
  },
  intensityLabel: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 6,
  },
  intensityBar: {
    width: '100%',
    height: 8,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  intensityFill: {
    height: '100%',
    backgroundColor: '#22C55E',
    borderRadius: 4,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 20,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1E293B',
  },
  statLabel: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
  },
  successOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  successCheck: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#22C55E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  successText: {
    fontSize: 40,
    color: '#fff',
    fontWeight: '700',
  },
  stopButton: {
    marginTop: 30,
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 25,
    backgroundColor: '#F1F5F9',
  },
  stopButtonText: {
    fontSize: 16,
    color: '#64748B',
    fontWeight: '600',
  },
});

export default ExerciseView;