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
                minDataPoints: 3, // تقليل الحد الأدنى ليعمل مع البيانات المحدودة
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
        try {
            const preparedData = this.prepareDataForPrediction(historicalData);
            
            // التحقق من وجود بيانات كافية
            if (!preparedData || preparedData.length === 0) {
                throw new Error('لا توجد بيانات صالحة للتنبؤ');
            }
            
            if (preparedData.length < 2) {
                throw new Error('البيانات غير كافية للتنبؤ - يحتاج على الأقل قراءتين صحيحتين');
            }
            
            console.log(`تحضير البيانات للتنبؤ: ${preparedData.length} قراءة صالحة من أصل ${historicalData.length}`);
            
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
        } catch (error) {
            console.error('خطأ في التنبؤ:', error);
            throw new Error('فشل في إنشاء التنبؤ: ' + error.message);
        }
    }

    // ========= النموذج الخطي =========
    linearRegressionForecast(data, periods) {
        if (data.length < this.modelSettings.linearRegression.minDataPoints) {
            throw new Error(`البيانات غير كافية للتنبؤ الخطي - يحتاج ${this.modelSettings.linearRegression.minDataPoints} قراءات على الأقل، متوفر ${data.length}`);
        }

        console.log(`تطبيق التنبؤ الخطي على ${data.length} قراءة لمدة ${periods} فترة`);
        
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
        try {
            if (data.length < 6) {
                throw new Error(`البيانات غير كافية للتنبؤ الموسمي - يحتاج 6 قراءات على الأقل، متوفر ${data.length}`);
            }
            
            console.log(`تطبيق التنبؤ الموسمي على ${data.length} قراءة لمدة ${periods} فترة`);
            
            const seasonalComponents = this.decomposeTimeSeries(data);
            const predictions = [];

            for (let i = 1; i <= periods; i++) {
                const seasonIndex = (data.length + i - 1) % this.modelSettings.seasonalDecomposition.seasonLength;
                const trendValue = seasonalComponents.trend[seasonalComponents.trend.length - 1] + 
                                  (seasonalComponents.trendSlope * i);
                const seasonalValue = seasonalComponents.seasonal[seasonIndex] || 0;
                
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
        } catch (error) {
            console.warn('فشل التنبؤ الموسمي:', error.message);
            throw error;
        }
    }

    // ========= التنعيم الأسي =========
    exponentialSmoothingForecast(data, periods) {
        try {
            if (data.length < 3) {
                throw new Error(`البيانات غير كافية للتنبؤ الأسي - يحتاج 3 قراءات على الأقل، متوفر ${data.length}`);
            }
            
            console.log(`تطبيق التنبؤ الأسي على ${data.length} قراءة لمدة ${periods} فترة`);
            
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
        } catch (error) {
            console.warn('فشل التنبؤ الأسي:', error.message);
            throw error;
        }
    }

    // ========= النموذج المختلط =========
    hybridForecast(data, periods) {
        try {
            console.log(`تطبيق التنبؤ المختلط على ${data.length} قراءة لمدة ${periods} فترة`);
            
            // التحقق من الحد الأدنى للبيانات
            if (data.length < 2) {
                throw new Error(`البيانات غير كافية للتنبؤ المختلط - يحتاج قراءتين على الأقل، متوفر ${data.length}`);
            }
            
            let linearPred = null;
            let seasonalPred = null;
            let expPred = null;
            
            // محاولة التنبؤ الخطي
            try {
                linearPred = this.linearRegressionForecast(data, periods);
                console.log('✓ التنبؤ الخطي نجح');
            } catch (error) {
                console.warn('التنبؤ الخطي فشل:', error.message);
            }
            
            // محاولة التنبؤ الموسمي
            try {
                seasonalPred = this.seasonalForecast(data, periods);
                console.log('✓ التنبؤ الموسمي نجح');
            } catch (error) {
                console.warn('التنبؤ الموسمي فشل:', error.message);
            }
            
            // محاولة التنبؤ الأسي
            try {
                expPred = this.exponentialSmoothingForecast(data, periods);
                console.log('✓ التنبؤ الأسي نجح');
            } catch (error) {
                console.warn('التنبؤ الأسي فشل:', error.message);
            }
            
            // التحقق من وجود نموذج واحد على الأقل
            const availableModels = [linearPred, seasonalPred, expPred].filter(pred => pred !== null);
            if (availableModels.length === 0) {
                console.warn('جميع النماذج المتقدمة فشلت، استخدام نموذج بسيط');
                
                // نموذج بسيط كحل احتياطي
                const predictions = [];
                const values = data.map(d => d.value);
                const avgValue = this.calculateMean(values);
                const lastValue = values[values.length - 1];
                
                // حساب اتجاه بسيط
                const recentValues = values.slice(-Math.min(3, values.length));
                const simpleSlope = recentValues.length > 1 ? 
                    (recentValues[recentValues.length - 1] - recentValues[0]) / (recentValues.length - 1) : 0;
                
                for (let i = 1; i <= periods; i++) {
                    const predictedValue = lastValue + (simpleSlope * i);
                    predictions.push({
                        period: data.length + i,
                        value: Math.max(0, predictedValue),
                        confidence: Math.max(0.3, 0.8 - (i * 0.05)),
                        method: 'simple_fallback'
                    });
                }
                
                console.log(`نموذج بسيط: تنبؤ ${periods} فترات بناءً على ${data.length} قراءات`);
                return predictions;
            }
            
            console.log(`استخدام ${availableModels.length} نموذج/نماذج للتنبؤ المختلط`);

            const predictions = [];

            for (let i = 0; i < periods; i++) {
                // حساب الوزن لكل نموذج بناءً على الأداء
                const weights = this.calculateModelWeights(data);
                
                let combinedValue = 0;
                let combinedConfidence = 0;
                let totalWeight = 0;
                
                const components = {};
                
                if (linearPred) {
                    combinedValue += linearPred[i].value * weights.linear;
                    combinedConfidence += linearPred[i].confidence * weights.linear;
                    totalWeight += weights.linear;
                    components.linear = linearPred[i].value;
                }
                
                if (seasonalPred) {
                    combinedValue += seasonalPred[i].value * weights.seasonal;
                    combinedConfidence += seasonalPred[i].confidence * weights.seasonal;
                    totalWeight += weights.seasonal;
                    components.seasonal = seasonalPred[i].value;
                }
                
                if (expPred) {
                    combinedValue += expPred[i].value * weights.exponential;
                    combinedConfidence += expPred[i].confidence * weights.exponential;
                    totalWeight += weights.exponential;
                    components.exponential = expPred[i].value;
                }
                
                // تطبيع النتائج
                if (totalWeight > 0) {
                    combinedValue /= totalWeight;
                    combinedConfidence /= totalWeight;
                }

                predictions.push({
                    period: data.length + i + 1,
                    value: Math.max(0, combinedValue),
                    confidence: combinedConfidence,
                    components: components,
                    weights: weights,
                    method: 'hybrid_ensemble'
                });
            }

            return predictions;
        } catch (error) {
            console.error('خطأ في التنبؤ المختلط:', error);
            throw new Error('فشل التنبؤ المختلط: ' + error.message);
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
            .filter(reading => {
                // التحقق من جميع أشكال البيانات الممكنة
                const abstraction = reading.corrected_abstraction || 
                                   reading.estimated_abstraction ||
                                   reading.monthly_abstraction_m3 || 
                                   reading.abstraction ||
                                   reading.abstraction_m3;
                const dateValue = reading.reading_date || reading.readingDate || reading.date;
                
                return abstraction && !isNaN(parseFloat(abstraction)) && dateValue;
            })
            .map((reading, index) => {
                // استخدام البيانات المُصححة أولاً، ثم الأصلية
                const abstraction = parseFloat(reading.corrected_abstraction) || 
                                   parseFloat(reading.estimated_abstraction) ||
                                   parseFloat(reading.monthly_abstraction_m3) || 
                                   parseFloat(reading.abstraction) ||
                                   parseFloat(reading.abstraction_m3) || 0;
                                   
                const dateValue = reading.reading_date || reading.readingDate || reading.date;
                const wellId = reading.well_id || reading.wellId || reading.id || reading.well_number;
                
                return {
                    index: index,
                    date: new Date(dateValue),
                    value: abstraction,
                    wellId: wellId
                };
            })
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

    // ========= دوال مساعدة للتنبؤ =========
    
    applyExponentialSmoothing(data) {
        const alpha = this.modelSettings.exponentialSmoothing.alpha;
        const beta = this.modelSettings.exponentialSmoothing.beta;
        
        const level = [data[0].value];
        const trend = [0];
        const error = [];
        
        for (let i = 1; i < data.length; i++) {
            const prevLevel = level[i - 1];
            const prevTrend = trend[i - 1];
            
            const currentLevel = alpha * data[i].value + (1 - alpha) * (prevLevel + prevTrend);
            const currentTrend = beta * (currentLevel - prevLevel) + (1 - beta) * prevTrend;
            
            level.push(currentLevel);
            trend.push(currentTrend);
            
            const forecast = prevLevel + prevTrend;
            error.push(Math.abs(data[i].value - forecast));
        }
        
        return { level, trend, error };
    }

    calculateSeasonalComponent(data, trend, seasonLength) {
        const seasonal = new Array(seasonLength).fill(0);
        const counts = new Array(seasonLength).fill(0);
        
        for (let i = 0; i < data.length; i++) {
            const seasonIndex = i % seasonLength;
            const detrended = data[i].value - (trend[i] || data[i].value);
            seasonal[seasonIndex] += detrended;
            counts[seasonIndex]++;
        }
        
        // حساب المتوسط الموسمي
        for (let i = 0; i < seasonLength; i++) {
            seasonal[i] = counts[i] > 0 ? seasonal[i] / counts[i] : 0;
        }
        
        return seasonal;
    }

    calculateResidual(data, trend, seasonal) {
        return data.map((point, i) => {
            const seasonIndex = i % seasonal.length;
            return point.value - trend[i] - seasonal[seasonIndex];
        });
    }

    calculateTrendSlope(trend) {
        if (trend.length < 2) return 0;
        
        const n = trend.length;
        const x = Array.from({length: n}, (_, i) => i);
        const y = trend;
        
        const sumX = x.reduce((sum, val) => sum + val, 0);
        const sumY = y.reduce((sum, val) => sum + val, 0);
        const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0);
        const sumXX = x.reduce((sum, val) => sum + val * val, 0);
        
        return (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    }

    assessDecompositionQuality(data, trend, seasonal, residual) {
        // حساب جودة التفكيك بناءً على نسبة التباين المفسر
        const totalVariance = this.calculateVariance(data.map(d => d.value));
        const residualVariance = this.calculateVariance(residual);
        
        return Math.max(0, 1 - (residualVariance / totalVariance));
    }

    calculateVariance(values) {
        const mean = this.calculateMean(values);
        return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    }

    // دوال حساب مستوى الثقة
    calculateLinearConfidence(period, r2) {
        return Math.max(0.3, Math.min(0.95, r2 * (1 - period * 0.05)));
    }

    calculateSeasonalConfidence(period, quality) {
        return Math.max(0.4, Math.min(0.9, quality * (1 - period * 0.03)));
    }

    calculateExponentialConfidence(period, error) {
        const avgError = this.calculateMean(error);
        return Math.max(0.3, Math.min(0.85, 1 - (avgError * 0.1) - (period * 0.05)));
    }

    calculatePredictionConfidence(predictions) {
        if (!predictions || predictions.length === 0) return 0;
        return this.calculateMean(predictions.map(p => p.confidence || 0.5));
    }

    calculatePredictionBounds(value, period, standardError) {
        const margin = standardError * Math.sqrt(1 + 1/period) * 1.96; // 95% confidence interval
        return {
            lower: Math.max(0, value - margin),
            upper: value + margin
        };
    }

    getMethodologyExplanation(modelType) {
        const explanations = {
            linear: 'التنبؤ الخطي يعتمد على تحليل الاتجاه العام للبيانات التاريخية',
            seasonal: 'التنبؤ الموسمي يأخذ في الاعتبار الأنماط الموسمية المتكررة',
            exponential: 'التنعيم الأسي يعطي وزناً أكبر للبيانات الحديثة',
            hybrid: 'النموذج المختلط يجمع بين عدة طرق تنبؤ لتحسين الدقة'
        };
        return explanations[modelType] || 'تنبؤ متقدم باستخدام خوارزميات متعددة';
    }
}

// تصدير الكلاس
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PredictionEngine };
}
