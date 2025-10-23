// تحسينات نظام تقدير القراءات للآبار
// Wells Reading Estimation System Improvements

class AdvancedEstimationEngine {
  constructor() {
    this.outlierThreshold = 2.5; // Z-score threshold
    this.seasonalWeights = {
      winter: [11, 0, 1], // ديسمبر، يناير، فبراير
      spring: [2, 3, 4],  // مارس، أبريل، مايو
      summer: [5, 6, 7],  // يونيو، يوليو، أغسطس
      autumn: [8, 9, 10]  // سبتمبر، أكتوبر، نوفمبر
    };
  }

  // 1. كشف الشواذ المحسن
  detectOutliers(readings) {
    const values = readings
      .filter(r => r.monthly_abstraction_m3 > 0)
      .map(r => r.monthly_abstraction_m3);
    
    if (values.length < 3) return [];
    
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    
    return readings.map((reading, index) => ({
      ...reading,
      isOutlier: reading.monthly_abstraction_m3 > 0 && 
                 Math.abs(reading.monthly_abstraction_m3 - mean) > (this.outlierThreshold * stdDev),
      zScore: reading.monthly_abstraction_m3 > 0 ? 
              Math.abs(reading.monthly_abstraction_m3 - mean) / stdDev : 0
    }));
  }

  // 2. تحليل موسمي محسن
  enhancedSeasonalAnalysis(readings) {
    const seasonalData = {
      winter: [], spring: [], summer: [], autumn: []
    };
    
    readings.forEach(reading => {
      if (reading.monthly_abstraction_m3 <= 0) return;
      
      const month = new Date(reading.reading_date).getMonth();
      const season = this.getSeasonFromMonth(month);
      
      seasonalData[season].push({
        value: reading.monthly_abstraction_m3,
        month: month,
        date: reading.reading_date
      });
    });
    
    // حساب الإحصائيات الموسمية
    const seasonalStats = {};
    for (const season in seasonalData) {
      const values = seasonalData[season].map(item => item.value);
      if (values.length > 0) {
        seasonalStats[season] = {
          mean: this.calculateMean(values),
          median: this.calculateMedian(values),
          std: this.calculateStdDev(values),
          trend: this.calculateSeasonalTrend(seasonalData[season]),
          confidence: this.calculateConfidence(values.length)
        };
      }
    }
    
    return seasonalStats;
  }

  // 3. تقدير ذكي بالتعلم الآلي
  mlBasedEstimation(targetIndex, readings) {
    const validReadings = readings.filter(r => r.monthly_abstraction_m3 > 0);
    
    if (validReadings.length < 5) {
      return this.fallbackEstimation(targetIndex, readings);
    }
    
    // تحضير البيانات للنموذج
    const features = this.extractFeatures(readings, targetIndex);
    const historicalData = this.prepareTrainingData(validReadings);
    
    // تطبيق Linear Regression البسيط
    const prediction = this.simpleLinearRegression(historicalData, features);
    
    // تطبيق تنعيم للنتيجة
    const smoothed = this.applySmoothingFilter(prediction, readings, targetIndex);
    
    return {
      estimated: smoothed,
      confidence: this.calculatePredictionConfidence(historicalData, features),
      method: 'ML-Enhanced'
    };
  }

  // 4. استخراج الميزات للتعلم الآلي
  extractFeatures(readings, targetIndex) {
    const targetDate = new Date(readings[targetIndex].reading_date);
    
    return {
      month: targetDate.getMonth(),
      season: this.getSeasonFromMonth(targetDate.getMonth()),
      dayOfYear: this.getDayOfYear(targetDate),
      timeSinceLastReading: this.getTimeSinceLastReading(readings, targetIndex),
      averageGapPattern: this.getAverageGapPattern(readings),
      historicalTrend: this.getHistoricalTrend(readings, targetIndex)
    };
  }

  // 5. نموذج الانحدار الخطي البسيط
  simpleLinearRegression(historicalData, features) {
    if (historicalData.length < 2) return 0;
    
    // تحويل الميزات إلى قيم رقمية
    const x = features.month + (features.dayOfYear / 365) + features.timeSinceLastReading;
    
    // حساب معاملات الانحدار
    const n = historicalData.length;
    const sumX = historicalData.reduce((sum, item) => sum + item.x, 0);
    const sumY = historicalData.reduce((sum, item) => sum + item.y, 0);
    const sumXY = historicalData.reduce((sum, item) => sum + (item.x * item.y), 0);
    const sumX2 = historicalData.reduce((sum, item) => sum + (item.x * item.x), 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    const prediction = slope * x + intercept;
    return Math.max(0, prediction);
  }

  // 6. مرشح التنعيم
  applySmoothingFilter(prediction, readings, targetIndex) {
    const windowSize = 3;
    const nearbyValues = [];
    
    // جمع القيم القريبة
    for (let i = Math.max(0, targetIndex - windowSize); 
         i <= Math.min(readings.length - 1, targetIndex + windowSize); 
         i++) {
      if (i !== targetIndex && readings[i].monthly_abstraction_m3 > 0) {
        nearbyValues.push(readings[i].monthly_abstraction_m3);
      }
    }
    
    if (nearbyValues.length === 0) return prediction;
    
    const nearbyAverage = nearbyValues.reduce((sum, val) => sum + val, 0) / nearbyValues.length;
    
    // وزن التنبؤ مع المتوسط المحلي
    return (prediction * 0.7) + (nearbyAverage * 0.3);
  }

  // 7. حساب مستوى الثقة
  calculatePredictionConfidence(historicalData, features) {
    const dataQuality = Math.min(historicalData.length / 12, 1); // نسبة البيانات المتاحة
    const seasonalConfidence = this.getSeasonalConfidence(features.season);
    const trendStability = this.calculateTrendStability(historicalData);
    
    return (dataQuality * 0.4) + (seasonalConfidence * 0.3) + (trendStability * 0.3);
  }

  // 8. التحقق من جودة التقدير
  validateEstimation(estimated, readings, targetIndex) {
    const validation = {
      isValid: true,
      warnings: [],
      adjustedValue: estimated
    };
    
    // التحقق من المعقولية
    const nearbyValues = this.getNearbyValues(readings, targetIndex, 3);
    if (nearbyValues.length > 0) {
      const maxNearby = Math.max(...nearbyValues);
      const minNearby = Math.min(...nearbyValues);
      
      // إذا كان التقدير خارج النطاق المعقول
      if (estimated > maxNearby * 2) {
        validation.warnings.push('التقدير أعلى من المتوقع');
        validation.adjustedValue = Math.min(estimated, maxNearby * 1.5);
      }
      
      if (estimated < minNearby * 0.5 && estimated > 0) {
        validation.warnings.push('التقدير أقل من المتوقع');
        validation.adjustedValue = Math.max(estimated, minNearby * 0.7);
      }
    }
    
    // التحقق من الاتجاه العام
    const trend = this.getHistoricalTrend(readings, targetIndex);
    if (Math.abs(trend) > 0.1) { // اتجاه قوي
      const trendAdjustment = trend * 0.1;
      validation.adjustedValue += trendAdjustment;
      validation.warnings.push(`تم تطبيق تعديل الاتجاه: ${trendAdjustment > 0 ? '+' : ''}${trendAdjustment.toFixed(1)}`);
    }
    
    return validation;
  }

  // 9. تقرير جودة التقدير
  generateEstimationReport(readings, estimatedReadings) {
    const totalReadings = readings.length;
    const estimatedCount = estimatedReadings.filter(r => r.hasEstimation).length;
    const confidenceSum = estimatedReadings
      .filter(r => r.hasEstimation && r.confidence)
      .reduce((sum, r) => sum + r.confidence, 0);
    
    const avgConfidence = estimatedCount > 0 ? confidenceSum / estimatedCount : 0;
    
    return {
      totalReadings,
      estimatedCount,
      estimationPercentage: (estimatedCount / totalReadings * 100).toFixed(1),
      averageConfidence: (avgConfidence * 100).toFixed(1),
      dataQuality: this.assessDataQuality(readings),
      recommendations: this.generateRecommendations(readings, estimatedReadings)
    };
  }

  // 10. توصيات لتحسين جودة البيانات
  generateRecommendations(readings, estimatedReadings) {
    const recommendations = [];
    
    const estimationRate = estimatedReadings.filter(r => r.hasEstimation).length / readings.length;
    
    if (estimationRate > 0.3) {
      recommendations.push('نسبة عالية من القراءات المقدرة - يُنصح بزيادة تكرار القراءات الفعلية');
    }
    
    const gaps = this.analyzeReadingGaps(readings);
    if (gaps.maxGap > 90) {
      recommendations.push(`فجوة كبيرة في البيانات (${gaps.maxGap} يوم) - قد تؤثر على دقة التقدير`);
    }
    
    const outliers = this.detectOutliers(readings).filter(r => r.isOutlier);
    if (outliers.length > 0) {
      recommendations.push(`تم اكتشاف ${outliers.length} قراءة شاذة - يُنصح بمراجعتها`);
    }
    
    return recommendations;
  }

  // وظائف مساعدة
  getSeasonFromMonth(month) {
    if (this.seasonalWeights.winter.includes(month)) return 'winter';
    if (this.seasonalWeights.spring.includes(month)) return 'spring';
    if (this.seasonalWeights.summer.includes(month)) return 'summer';
    return 'autumn';
  }

  calculateMean(values) {
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  calculateMedian(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 
      ? (sorted[mid - 1] + sorted[mid]) / 2 
      : sorted[mid];
  }

  calculateStdDev(values) {
    const mean = this.calculateMean(values);
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  getDayOfYear(date) {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date - start;
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  }

  fallbackEstimation(targetIndex, readings) {
    // العودة للطريقة الحالية في حالة عدم توفر بيانات كافية
    return {
      estimated: 0,
      confidence: 0.3,
      method: 'Fallback'
    };
  }

  // تحضير بيانات التدريب
  prepareTrainingData(validReadings) {
    return validReadings.map((reading, index) => {
      const date = new Date(reading.reading_date);
      return {
        x: date.getMonth() + (this.getDayOfYear(date) / 365),
        y: reading.monthly_abstraction_m3,
        index: index
      };
    });
  }

  getTimeSinceLastReading(readings, targetIndex) {
    for (let i = targetIndex - 1; i >= 0; i--) {
      if (readings[i].monthly_abstraction_m3 > 0) {
        const lastDate = new Date(readings[i].reading_date);
        const targetDate = new Date(readings[targetIndex].reading_date);
        return (targetDate - lastDate) / (1000 * 60 * 60 * 24); // أيام
      }
    }
    return 30; // افتراضي شهر واحد
  }

  getAverageGapPattern(readings) {
    const gaps = [];
    for (let i = 1; i < readings.length; i++) {
      const prev = new Date(readings[i-1].reading_date);
      const curr = new Date(readings[i].reading_date);
      gaps.push((curr - prev) / (1000 * 60 * 60 * 24));
    }
    return gaps.length > 0 ? gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length : 30;
  }

  getHistoricalTrend(readings, targetIndex) {
    const validReadings = readings
      .slice(0, targetIndex)
      .filter(r => r.monthly_abstraction_m3 > 0)
      .slice(-6); // آخر 6 قراءات صحيحة
    
    if (validReadings.length < 2) return 0;
    
    const values = validReadings.map(r => r.monthly_abstraction_m3);
    const n = values.length;
    
    let slope = 0;
    for (let i = 1; i < n; i++) {
      slope += (values[i] - values[i-1]) / values[i-1];
    }
    
    return slope / (n - 1);
  }

  getSeasonalConfidence(season) {
    // ثقة أعلى في الصيف حيث الاستهلاك أكثر انتظاماً
    const seasonConfidence = {
      summer: 0.9,
      winter: 0.8,
      spring: 0.7,
      autumn: 0.7
    };
    return seasonConfidence[season] || 0.7;
  }

  calculateTrendStability(historicalData) {
    if (historicalData.length < 3) return 0.5;
    
    const variations = [];
    for (let i = 1; i < historicalData.length; i++) {
      const change = Math.abs(historicalData[i].y - historicalData[i-1].y) / historicalData[i-1].y;
      variations.push(change);
    }
    
    const avgVariation = variations.reduce((sum, v) => sum + v, 0) / variations.length;
    return Math.max(0, 1 - avgVariation); // كلما قل التذبذب، زادت الثقة
  }

  getNearbyValues(readings, targetIndex, window) {
    const values = [];
    for (let i = Math.max(0, targetIndex - window); 
         i <= Math.min(readings.length - 1, targetIndex + window); 
         i++) {
      if (i !== targetIndex && readings[i].monthly_abstraction_m3 > 0) {
        values.push(readings[i].monthly_abstraction_m3);
      }
    }
    return values;
  }

  analyzeReadingGaps(readings) {
    const gaps = [];
    for (let i = 1; i < readings.length; i++) {
      const prev = new Date(readings[i-1].reading_date);
      const curr = new Date(readings[i].reading_date);
      gaps.push((curr - prev) / (1000 * 60 * 60 * 24));
    }
    
    return {
      maxGap: gaps.length > 0 ? Math.max(...gaps) : 0,
      avgGap: gaps.length > 0 ? gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length : 0,
      totalGaps: gaps.length
    };
  }

  assessDataQuality(readings) {
    const totalReadings = readings.length;
    const validReadings = readings.filter(r => r.monthly_abstraction_m3 > 0).length;
    const validityRatio = validReadings / totalReadings;
    
    const gaps = this.analyzeReadingGaps(readings);
    const gapScore = Math.max(0, 1 - (gaps.maxGap / 365)); // تقييم الفجوات
    
    const overallScore = (validityRatio * 0.6) + (gapScore * 0.4);
    
    if (overallScore >= 0.8) return 'ممتازة';
    if (overallScore >= 0.6) return 'جيدة';
    if (overallScore >= 0.4) return 'متوسطة';
    return 'ضعيفة';
  }

  calculateSeasonalTrend(seasonalData) {
    if (seasonalData.length < 3) return 0;
    
    // ترتيب البيانات حسب التاريخ
    const sorted = seasonalData.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // حساب الاتجاه الخطي
    const n = sorted.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    
    sorted.forEach((item, i) => {
      sumX += i;
      sumY += item.value;
      sumXY += i * item.value;
      sumX2 += i * i;
    });
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    return isFinite(slope) ? slope : 0;
  }

  calculateConfidence(dataCount) {
    // كلما زادت البيانات، زادت الثقة
    return Math.min(1, dataCount / 12); // ثقة كاملة مع 12 نقطة بيانات أو أكثر
  }
}

// تصدير الكلاس للاستخدام
window.AdvancedEstimationEngine = AdvancedEstimationEngine;