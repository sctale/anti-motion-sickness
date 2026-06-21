import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import LottieView from 'lottie-react-native';

const { width } = Dimensions.get('window');

interface CompleteScreenProps {
  exerciseCount: number;
  onRestart: () => void;
}

export const CompleteScreen: React.FC<CompleteScreenProps> = ({ exerciseCount, onRestart }) => {
  const getEncourageMessage = () => {
    if (exerciseCount >= 30) return '太棒了！';
    if (exerciseCount >= 15) return '做得好！';
    if (exerciseCount >= 5) return '继续加油！';
    return '完成啦！';
  };

  const getSubMessage = () => {
    if (exerciseCount >= 30) return '你的晕车缓解能力很强，继续保持！';
    if (exerciseCount >= 15) return '今天的状态不错，乘车时会更舒适';
    if (exerciseCount >= 5) return '多练习几次效果会更好';
    return '休息一下吧，必要时再继续';
  };

  return (
    <View style={styles.container}>
      <View style={styles.animationContainer}>
        <LottieView
          source={require('../assets/complete.json')}
          autoPlay
          loop={false}
          style={styles.celebrationIcon}
        />
      </View>
      
      <Text style={styles.title}>{getEncourageMessage()}</Text>
      
      <View style={styles.resultCard}>
        <Text style={styles.resultLabel}>本次完成动作</Text>
        <Text style={styles.resultNumber}>{exerciseCount}</Text>
        <Text style={styles.resultUnit}>次</Text>
      </View>
      
      <Text style={styles.subMessage}>{getSubMessage()}</Text>

      <View style={styles.tipsContainer}>
        <Text style={styles.tipsTitle}>💡 小贴士</Text>
        <Text style={styles.tipsText}>
          建议在乘车前进行1-2分钟练习，效果更佳
        </Text>
      </View>

      <TouchableOpacity 
        style={styles.restartButton} 
        onPress={onRestart}
        activeOpacity={0.8}
      >
        <Text style={styles.restartButtonText}>再来一次</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  animationContainer: {
    width: 150,
    height: 150,
    marginBottom: 20,
  },
  celebrationIcon: {
    width: 150,
    height: 150,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#6366F1',
    marginBottom: 30,
  },
  resultCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 25,
    alignItems: 'center',
    marginBottom: 25,
    width: width * 0.7,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },
  resultLabel: {
    fontSize: 14,
    color: '#888',
    marginBottom: 8,
  },
  resultNumber: {
    fontSize: 64,
    fontWeight: '800',
    color: '#6366F1',
  },
  resultUnit: {
    fontSize: 16,
    color: '#6366F1',
    fontWeight: '500',
  },
  subMessage: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    marginBottom: 25,
    lineHeight: 22,
  },
  tipsContainer: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 16,
    marginBottom: 30,
    width: width * 0.85,
  },
  tipsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  tipsText: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 20,
  },
  restartButton: {
    backgroundColor: '#6366F1',
    borderRadius: 30,
    paddingVertical: 16,
    paddingHorizontal: 60,
  },
  restartButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});