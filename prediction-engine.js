// ========= محرك التنبؤ والتحليل المتقدم =========

class PredictionEngine {
    constructor() {
        this.models = {};
        this.initializeModels();
    }

    initializeModels() {
        console.log('تم تهيئة محرك التنبؤ المتقدم');
        
        // إعدادات النماذج المختلفة
        this.modelSettings = {
            linearRegression: {
                minDataPoints: 6,
                confidenceThreshold: 0.7
            },
            seasonalDecomposition: {
                seasonLength: 12, // شهرياً
                trendWindow: 3
            },
            exponentialSmoothing: {
                alpha: 0.3, // معامل التنعيم
                beta: 0.3,  // معامل الاتجاه
                gamma: 0.3  // معامل الموسمية
            }
        };
    }

    // ========= التنبؤ بالاستهلاك المستقبلي =========
    predictFutureConsumption(historicalData, forecastPeriods = 6, modelType = 'hybrid') {
        const preparedData = this.prepareDataForPrediction(historicalData);
        
        let predictions = [];
        
        switch (modelType) {
            case 'linear':
                predictions = this.linearRegressionForecast(preparedData, forecastPeriods);
                break;
            case 'seasonal':
                predictions = this.seasonalForecast(preparedData, forecastPeriods);
                break;
            case 'exponential':
                predictions = this.exponentialSmoothingForecast(preparedData, forecastPeriods);
                break;
            case 'hybrid':
                predictions = this.hybridForecast(preparedData, forecastPeriods);
                break;
            default:
                predictions = this.hybridForecast(preparedData, forecastPeriods);
        }

        return {
            predictions: predictions,
            accuracy: this.calculateModelAccuracy(preparedData, modelType),
            confidence: this.calculatePredictionConfidence(predictions),
            methodology: this.getMethodologyExplanation(modelType),
            recommendations: this.generatePredictionRecommendations(predictions)
        };
    }

    // ========= النموذج الخطي =========
    linearRegressionForecast(data, periods) {
        if (data.length < this.modelSettings.linearRegression.minDataPoints) {
            throw new Error('البيانات غير كافية للتنبؤ الخطي');
        }

        const trend = this.calculateLinearTrend(data);
        const predictions = [];

        for (let i = 1; i <= periods; i++) {
            const futureX = data.length + i;
            const predictedValue = trend.slope * futureX + trend.intercept;
            
            predictions.push({
                period: futureX,
                value: Math.max(0, predictedValue),
                confidence: this.calculateLinearConfidence(i, trend.r2),
                bounds: this.calculatePredictionBounds(predictedValue, i, trend.standardError),
                method: 'linear_regression'
            });
        }

        return predictions;
    }

    // ========= النموذج الموسمي =========
    seasonalForecast(data, periods) {
        const seasonalComponents = this.decomposeTimeSeries(data);
        const predictions = [];

        for (let i = 1; i <= periods; i++) {
            const seasonIndex = (data.length + i - 1) % this.modelSettings.seasonalDecomposition.seasonLength;
            const trendValue = seasonalComponents.trend[seasonalComponents.trend.length - 1] + 
                              (seasonalComponents.trendSlope * i);
            const seasonalValue = seasonalComponents.seasonal[seasonIndex];
            
            const predictedValue = trendValue + seasonalValue;
            
            predictions.push({
                period: data.length + i,
                value: Math.max(0, predictedValue),
                trend: trendValue,
                seasonal: seasonalValue,
                confidence: this.calculateSeasonalConfidence(i, seasonalComponents.quality),
                method: 'seasonal_decomposition'
            });
        }

        return predictions;
    }

    // ========= التنعيم الأسي =========
    exponentialSmoothingForecast(data, periods) {
        const smoothedData = this.applyExponentialSmoothing(data);
        const predictions = [];

        let lastLevel = smoothedData.level[smoothedData.level.length - 1];
        let lastTrend = smoothedData.trend[smoothedData.trend.length - 1];

        for (let i = 1; i <= periods; i++) {
            const predictedValue = lastLevel + (i * lastTrend);
            
            predictions.push({
                period: data.length + i,
                value: Math.max(0, predictedValue),
                level: lastLevel,
                trend: lastTrend,
                confidence: this.calculateExponentialConfidence(i, smoothedData.error),
                method: 'exponential_smoothing'
            });
        }

        return predictions;
    }

    // ========= النموذج المختلط =========
    hybridForecast(data, periods) {
        try {
            const linearPred = this.linearRegressionForecast(data, periods);
            const seasonalPred = this.seasonalForecast(data, periods);
            const expPred = this.exponentialSmoothingForecast(data, periods);

            const predictions = [];

            for (let i = 0; i < periods; i++) {
                // حساب الوزن لكل نموذج بناءً على الأداء
                const weights = this.calculateModelWeights(data);
                
                const combinedValue = 
                    (linearPred[i].value * weights.linear) +
                    (seasonalPred[i].value * weights.seasonal) +
                    (expPred[i].value * weights.exponential);

                const combinedConfidence = 
                    (linearPred[i].confidence * weights.linear) +
                    (seasonalPred[i].confidence * weights.seasonal) +
                    (expPred[i].confidence * weights.exponential);

                predictions.push({
                    period: data.length + i + 1,
                    value: Math.max(0, combinedValue),
                    confidence: combinedConfidence,
                    components: {
                        linear: linearPred[i].value,
                        seasonal: seasonalPred[i].value,
                        exponential: expPred[i].value
                    },
                    weights: weights,
                    method: 'hybrid_ensemble'
                });
            }

            return predictions;
        } catch (error) {
            console.warn('فشل النموذج المختلط، استخدام النموذج الخطي كبديل');
            return this.linearRegressionForecast(data, periods);
        }
    }

    // ========= تحليل الاتجاهات =========
    analyzeTrends(data, analysisDepth = 'comprehensive') {
        const trends = {
            overall: this.calculateOverallTrend(data),
            seasonal: this.analyzeSeasonalTrends(data),
            cyclical: this.identifyCyclicalPatterns(data),
            volatility: this.calculateVolatilityMetrics(data),
            anomalies: this.detectTrendAnomalies(data),
            changePoints: this.detectChangePoints(data)
        };

        if (analysisDepth === 'comprehensive') {
            trends.forecast = this.predictFutureConsumption(data, 12, 'hybrid');
            trends.scenarios = this.generateScenarioAnalysis(data);
            trends.riskAssessment = this.assessForecastRisks(data);
        }

        return trends;
    }

    calculateOverallTrend(data) {
        const trend = this.calculateLinearTrend(data);
        
        return {
            direction: trend.slope > 0 ? 'increasing' : trend.slope < 0 ? 'decreasing' : 'stable',
            slope: trend.slope,
            strength: Math.abs(trend.r2),
            significance: trend.r2 > 0.5 ? 'strong' : trend.r2 > 0.3 ? 'moderate' : 'weak',
            monthlyChange: trend.slope,
            annualChange: trend.slope * 12,
            description: this.describeTrend(trend)
        };
    }

    analyzeSeasonalTrends(data) {
        const monthlyAverages = this.calculateMonthlyAverages(data);
        const seasonalFactors = this.calculateSeasonalFactors(data);
        
        return {
            pattern: this.identifySeasonalPattern(monthlyAverages),
            peakMonth: this.findPeakMonth(monthlyAverages),
            lowMonth: this.findLowMonth(monthlyAverages),
            amplitude: this.calculateSeasonalAmplitude(monthlyAverages),
            consistency: this.calculateSeasonalConsistency(data),
            factors: seasonalFactors
        };
    }

    // ========= كشف نقاط التغيير =========
    detectChangePoints(data) {
        const changePoints = [];
        const windowSize = Math.min(6, Math.floor(data.length / 4));
        
        for (let i = windowSize; i < data.length - windowSize; i++) {
            const beforeWindow = data.slice(i - windowSize, i);
            const afterWindow = data.slice(i, i + windowSize);
            
            const beforeMean = this.calculateMean(beforeWindow.map(d => d.value));
            const afterMean = this.calculateMean(afterWindow.map(d => d.value));
            
            const changeMagnitude = Math.abs(afterMean - beforeMean) / beforeMean;
            
            if (changeMagnitude > 0.2) { // تغيير بنسبة 20% أو أكثر
                changePoints.push({
                    index: i,
                    date: data[i].date,
                    beforeMean: beforeMean,
                    afterMean: afterMean,
                    changeMagnitude: changeMagnitude,
                    changeType: afterMean > beforeMean ? 'increase' : 'decrease',
                    significance: changeMagnitude > 0.5 ? 'major' : 'moderate'
                });
            }
        }
        
        return changePoints;
    }

    // ========= تحليل السيناريوهات =========
    generateScenarioAnalysis(data) {
        const baseForecast = this.predictFutureConsumption(data, 12, 'hybrid');
        
        return {
            optimistic: this.adjustForecast(baseForecast.predictions, 1.1), // زيادة 10%
            realistic: baseForecast.predictions,
            pessimistic: this.adjustForecast(baseForecast.predictions, 1.2), // زيادة 20%
            conservation: this.adjustForecast(baseForecast.predictions, 0.9), // توفير 10%
            scenarios: {
                drought: this.droughtScenario(baseForecast.predictions),
                growth: this.growthScenario(baseForecast.predictions),
                efficiency: this.efficiencyScenario(baseForecast.predictions)
            }
        };
    }

    // ========= تقييم المخاطر =========
    assessForecastRisks(data) {
        return {
            dataQuality: this.assessDataQualityRisk(data),
            volatility: this.assessVolatilityRisk(data),
            trend: this.assessTrendRisk(data),
            seasonal: this.assessSeasonalRisk(data),
            external: this.assessExternalRisks(data),
            overall: this.calculateOverallRisk(data)
        };
    }

    // ========= حسابات مساعدة =========
    prepareDataForPrediction(rawData) {
        return rawData
            .filter(reading => reading.abstraction && !isNaN(parseFloat(reading.abstraction)))
            .map((reading, index) => ({
                index: index,
                date: new Date(reading.readingDate),
                value: parseFloat(reading.abstraction),
                wellId: reading.wellId
            }))
            .sort((a, b) => a.date - b.date);
    }

    calculateLinearTrend(data) {
        const n = data.length;
        const sumX = data.reduce((sum, point, index) => sum + index, 0);
        const sumY = data.reduce((sum, point) => sum + point.value, 0);
        const sumXY = data.reduce((sum, point, index) => sum + (index * point.value), 0);
        const sumXX = data.reduce((sum, point, index) => sum + (index * index), 0);

        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        // حساب معامل التحديد R²
        const meanY = sumY / n;
        const ssRes = data.reduce((sum, point, index) => {
            const predicted = slope * index + intercept;
            return sum + Math.pow(point.value - predicted, 2);
        }, 0);
        const ssTot = data.reduce((sum, point) => sum + Math.pow(point.value - meanY, 2), 0);
        const r2 = 1 - (ssRes / ssTot);

        // حساب الخطأ المعياري
        const standardError = Math.sqrt(ssRes / (n - 2));

        return { slope, intercept, r2, standardError };
    }

    decomposeTimeSeries(data) {
        const seasonLength = this.modelSettings.seasonalDecomposition.seasonLength;
        const trend = this.calculateMovingAverage(data, this.modelSettings.seasonalDecomposition.trendWindow);
        const seasonal = this.calculateSeasonalComponent(data, trend, seasonLength);
        const residual = this.calculateResidual(data, trend, seasonal);

        return {
            trend: trend,
            seasonal: seasonal,
            residual: residual,
            trendSlope: this.calculateTrendSlope(trend),
            quality: this.assessDecompositionQuality(data, trend, seasonal, residual)
        };
    }

    calculateMovingAverage(data, window) {
        const result = [];
        for (let i = 0; i < data.length; i++) {
            const start = Math.max(0, i - Math.floor(window / 2));
            const end = Math.min(data.length, i + Math.floor(window / 2) + 1);
            const subset = data.slice(start, end);
            const average = subset.reduce((sum, point) => sum + point.value, 0) / subset.length;
            result.push(average);
        }
        return result;
    }

    calculateModelWeights(data) {
        // حساب الأوزان بناءً على أداء كل نموذج على البيانات التاريخية
        const accuracy = {
            linear: this.calculateModelAccuracy(data, 'linear'),
            seasonal: this.calculateModelAccuracy(data, 'seasonal'),
            exponential: this.calculateModelAccuracy(data, 'exponential')
        };

        const totalAccuracy = accuracy.linear + accuracy.seasonal + accuracy.exponential;
        
        return {
            linear: accuracy.linear / totalAccuracy,
            seasonal: accuracy.seasonal / totalAccuracy,
            exponential: accuracy.exponential / totalAccuracy
        };
    }

    calculateModelAccuracy(data, modelType) {
        if (data.length < 10) return 0.7; // قيمة افتراضية للبيانات القليلة
        
        const trainSize = Math.floor(data.length * 0.8);
        const trainData = data.slice(0, trainSize);
        const testData = data.slice(trainSize);
        
        let predictions;
        try {
            switch (modelType) {
                case 'linear':
                    predictions = this.linearRegressionForecast(trainData, testData.length);
                    break;
                case 'seasonal':
                    predictions = this.seasonalForecast(trainData, testData.length);
                    break;
                case 'exponential':
                    predictions = this.exponentialSmoothingForecast(trainData, testData.length);
                    break;
                default:
                    return 0.7;
            }

            // حساب MAPE (Mean Absolute Percentage Error)
            let totalError = 0;
            for (let i = 0; i < testData.length && i < predictions.length; i++) {
                const actual = testData[i].value;
                const predicted = predictions[i].value;
                if (actual !== 0) {
                    totalError += Math.abs((actual - predicted) / actual);
                }
            }

            const mape = totalError / Math.min(testData.length, predictions.length);
            return Math.max(0, 1 - mape); // تحويل MAPE إلى درجة دقة
        } catch (error) {
            return 0.5; // قيمة افتراضية في حالة الخطأ
        }
    }

    describeTrend(trend) {
        const slopeAbs = Math.abs(trend.slope);
        const direction = trend.slope > 0 ? 'زيادة' : trend.slope < 0 ? 'نقصان' : 'استقرار';
        
        let intensity = '';
        if (slopeAbs > 2) intensity = 'سريع';
        else if (slopeAbs > 1) intensity = 'متوسط';
        else if (slopeAbs > 0.5) intensity = 'بطيء';
        else intensity = 'طفيف';

        return `${direction} ${intensity} في الاستهلاك`;
    }

    generatePredictionRecommendations(predictions) {
        const recommendations = [];
        
        // تحليل التنبؤات للحصول على توصيات
        const avgPrediction = predictions.reduce((sum, p) => sum + p.value, 0) / predictions.length;
        const maxPrediction = Math.max(...predictions.map(p => p.value));
        const minConfidence = Math.min(...predictions.map(p => p.confidence));

        if (avgPrediction > 100) { // قيمة مرجعية
            recommendations.push({
                type: 'capacity_planning',
                priority: 'high',
                message: 'التنبؤ يشير إلى زيادة كبيرة في الاستهلاك',
                action: 'مراجعة خطط التوسع وزيادة الطاقة الإنتاجية'
            });
        }

        if (minConfidence < 0.6) {
            recommendations.push({
                type: 'data_quality',
                priority: 'medium',
                message: 'مستوى الثقة في التنبؤ منخفض',
                action: 'تحسين جودة البيانات وزيادة تكرار القراءات'
            });
        }

        return recommendations;
    }

    calculateMean(values) {
        return values.reduce((sum, val) => sum + val, 0) / values.length;
    }

    adjustForecast(forecast, factor) {
        return forecast.map(f => ({
            ...f,
            value: f.value * factor
        }));
    }
}

// تصدير الكلاس
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PredictionEngine };
}