// ========= نظام التنبيهات الذكية المتقدم =========

class SmartAlertSystem {
    constructor() {
        this.alerts = [];
        this.alertHistory = [];
        this.settings = this.getDefaultSettings();
        this.subscribers = new Map();
        this.initializeSystem();
    }

    initializeSystem() {
        console.log('تم تهيئة نظام التنبيهات الذكية');
        this.startPeriodicChecks();
    }

    getDefaultSettings() {
        return {
            thresholds: {
                highConsumption: {
                    multiplier: 1.5,        // 150% من المعدل الطبيعي
                    consecutivePeriods: 2,   // فترتان متتاليتان
                    enabled: true
                },
                lowWaterLevel: {
                    percentage: 30,          // 30% من المستوى الطبيعي
                    criticalPercentage: 15,  // 15% مستوى حرج
                    enabled: true
                },
                irregularPattern: {
                    deviationThreshold: 0.8, // انحراف 80%
                    patternWindow: 6,        // نافذة 6 قراءات
                    enabled: true
                },
                dataQuality: {
                    minQualityScore: 0.6,   // 60% حد أدنى للجودة
                    maxEstimatedRatio: 0.4, // 40% حد أقصى للتقديرات
                    enabled: true
                },
                forecast: {
                    confidenceThreshold: 0.5, // 50% ثقة في التنبؤ
                    alertHorizon: 30,         // 30 يوم مسبقاً
                    enabled: true
                }
            },
            notifications: {
                email: { enabled: false, addresses: [] },
                sms: { enabled: false, numbers: [] },
                dashboard: { enabled: true },
                sound: { enabled: true }
            },
            frequency: {
                realtime: true,
                daily: true,
                weekly: true,
                monthly: true
            }
        };
    }

    // ========= المراقبة الأساسية =========
    analyzeData(data) {
        const alerts = [];
        
        // كشف الاستهلاك المرتفع
        if (this.settings.thresholds.highConsumption.enabled) {
            alerts.push(...this.detectHighConsumption(data));
        }
        
        // كشف انخفاض مستوى المياه
        if (this.settings.thresholds.lowWaterLevel.enabled) {
            alerts.push(...this.detectLowWaterLevel(data));
        }
        
        // كشف الأنماط غير المنتظمة
        if (this.settings.thresholds.irregularPattern.enabled) {
            alerts.push(...this.detectIrregularPatterns(data));
        }
        
        // كشف مشاكل جودة البيانات
        if (this.settings.thresholds.dataQuality.enabled) {
            alerts.push(...this.detectDataQualityIssues(data));
        }
        
        // تنبيهات التنبؤ
        if (this.settings.thresholds.forecast.enabled) {
            alerts.push(...this.generatePredictiveAlerts(data));
        }
        
        // معالجة التنبيهات الجديدة
        this.processNewAlerts(alerts);
        
        return alerts;
    }

    // ========= كشف الاستهلاك المرتفع =========
    detectHighConsumption(data) {
        const alerts = [];
        const wellsData = this.groupDataByWell(data);
        
        Object.keys(wellsData).forEach(wellId => {
            const wellData = wellsData[wellId].sort((a, b) => new Date(a.readingDate) - new Date(b.readingDate));
            const recentReadings = wellData.slice(-this.settings.thresholds.highConsumption.consecutivePeriods);
            
            if (recentReadings.length >= this.settings.thresholds.highConsumption.consecutivePeriods) {
                const historicalAverage = this.calculateHistoricalAverage(wellData.slice(0, -this.settings.thresholds.highConsumption.consecutivePeriods));
                const recentAverage = this.calculateAverage(recentReadings.map(r => parseFloat(r.abstraction) || 0));
                
                if (recentAverage > historicalAverage * this.settings.thresholds.highConsumption.multiplier) {
                    const severity = this.calculateSeverity(recentAverage, historicalAverage, 'consumption');
                    
                    alerts.push({
                        id: this.generateAlertId(),
                        type: 'high_consumption',
                        severity: severity,
                        wellId: wellId,
                        title: 'استهلاك مرتفع',
                        message: `البئر ${wellId} يسجل استهلاكاً مرتفعاً: ${recentAverage.toFixed(2)} م³`,
                        details: {
                            current: recentAverage,
                            historical: historicalAverage,
                            increase: ((recentAverage / historicalAverage - 1) * 100).toFixed(1),
                            periods: this.settings.thresholds.highConsumption.consecutivePeriods,
                            readings: recentReadings
                        },
                        timestamp: new Date().toISOString(),
                        status: 'active',
                        category: 'consumption',
                        recommendations: this.getHighConsumptionRecommendations(wellId, recentAverage, historicalAverage),
                        impact: this.assessImpact(severity, 'consumption'),
                        urgency: this.calculateUrgency(severity, 'consumption')
                    });
                }
            }
        });
        
        return alerts;
    }

    // ========= كشف انخفاض مستوى المياه =========
    detectLowWaterLevel(data) {
        const alerts = [];
        
        // ملاحظة: هذا مثال - يحتاج بيانات مستوى المياه الفعلية
        const wellsData = this.groupDataByWell(data);
        
        Object.keys(wellsData).forEach(wellId => {
            const wellData = wellsData[wellId];
            const consumptionTrend = this.calculateConsumptionTrend(wellData);
            
            // تنبيه استباقي بناءً على اتجاه الاستهلاك
            if (consumptionTrend.isIncreasing && consumptionTrend.rate > 0.1) {
                alerts.push({
                    id: this.generateAlertId(),
                    type: 'potential_water_shortage',
                    severity: 'medium',
                    wellId: wellId,
                    title: 'تحذير مبكر - احتمال نقص المياه',
                    message: `اتجاه متزايد في الاستهلاك للبئر ${wellId} قد يؤدي إلى نقص في المياه`,
                    details: {
                        trendRate: consumptionTrend.rate,
                        projectedShortage: consumptionTrend.projectedDays,
                        currentConsumption: consumptionTrend.current
                    },
                    timestamp: new Date().toISOString(),
                    status: 'active',
                    category: 'water_level',
                    recommendations: this.getWaterLevelRecommendations(wellId, consumptionTrend),
                    impact: 'high',
                    urgency: 'medium'
                });
            }
        });
        
        return alerts;
    }

    // ========= كشف الأنماط غير المنتظمة =========
    detectIrregularPatterns(data) {
        const alerts = [];
        const wellsData = this.groupDataByWell(data);
        
        Object.keys(wellsData).forEach(wellId => {
            const wellData = wellsData[wellId].sort((a, b) => new Date(a.readingDate) - new Date(b.readingDate));
            
            if (wellData.length >= this.settings.thresholds.irregularPattern.patternWindow) {
                const patternAnalysis = this.analyzePattern(wellData);
                
                if (patternAnalysis.irregularityScore > this.settings.thresholds.irregularPattern.deviationThreshold) {
                    alerts.push({
                        id: this.generateAlertId(),
                        type: 'irregular_pattern',
                        severity: this.determineSeverityFromScore(patternAnalysis.irregularityScore),
                        wellId: wellId,
                        title: 'نمط استهلاك غير منتظم',
                        message: `نمط استهلاك غير اعتيادي للبئر ${wellId}`,
                        details: {
                            irregularityScore: patternAnalysis.irregularityScore,
                            patternType: patternAnalysis.type,
                            anomalies: patternAnalysis.anomalies,
                            expectedPattern: patternAnalysis.expected,
                            actualPattern: patternAnalysis.actual
                        },
                        timestamp: new Date().toISOString(),
                        status: 'active',
                        category: 'pattern',
                        recommendations: this.getPatternRecommendations(wellId, patternAnalysis),
                        impact: 'medium',
                        urgency: 'low'
                    });
                }
            }
        });
        
        return alerts;
    }

    // ========= كشف مشاكل جودة البيانات =========
    detectDataQualityIssues(data) {
        const alerts = [];
        const qualityMetrics = this.calculateDataQualityMetrics(data);
        
        // نسبة التقديرات العالية
        if (qualityMetrics.estimatedRatio > this.settings.thresholds.dataQuality.maxEstimatedRatio) {
            alerts.push({
                id: this.generateAlertId(),
                type: 'high_estimation_ratio',
                severity: 'medium',
                title: 'نسبة تقديرات عالية',
                message: `نسبة القراءات المقدرة مرتفعة: ${(qualityMetrics.estimatedRatio * 100).toFixed(1)}%`,
                details: {
                    estimatedCount: qualityMetrics.estimatedCount,
                    totalCount: qualityMetrics.totalCount,
                    ratio: qualityMetrics.estimatedRatio,
                    threshold: this.settings.thresholds.dataQuality.maxEstimatedRatio,
                    affectedWells: qualityMetrics.wellsWithHighEstimation
                },
                timestamp: new Date().toISOString(),
                status: 'active',
                category: 'data_quality',
                recommendations: this.getDataQualityRecommendations(qualityMetrics),
                impact: 'medium',
                urgency: 'medium'
            });
        }
        
        // جودة البيانات المنخفضة
        if (qualityMetrics.qualityScore < this.settings.thresholds.dataQuality.minQualityScore) {
            alerts.push({
                id: this.generateAlertId(),
                type: 'low_data_quality',
                severity: 'high',
                title: 'جودة بيانات منخفضة',
                message: `درجة جودة البيانات منخفضة: ${(qualityMetrics.qualityScore * 100).toFixed(1)}%`,
                details: qualityMetrics,
                timestamp: new Date().toISOString(),
                status: 'active',
                category: 'data_quality',
                recommendations: this.getDataQualityRecommendations(qualityMetrics),
                impact: 'high',
                urgency: 'high'
            });
        }
        
        return alerts;
    }

    // ========= التنبيهات التنبؤية =========
    generatePredictiveAlerts(data) {
        const alerts = [];
        
        try {
            // استخدام محرك التنبؤ
            const predictionEngine = new PredictionEngine();
            const forecast = predictionEngine.predictFutureConsumption(data, 6);
            
            // تحليل التنبؤات
            forecast.predictions.forEach((prediction, index) => {
                if (prediction.confidence < this.settings.thresholds.forecast.confidenceThreshold) {
                    alerts.push({
                        id: this.generateAlertId(),
                        type: 'low_forecast_confidence',
                        severity: 'medium',
                        title: 'ثقة منخفضة في التنبؤ',
                        message: `مستوى الثقة في التنبؤ منخفض للفترة القادمة`,
                        details: {
                            period: prediction.period,
                            confidence: prediction.confidence,
                            value: prediction.value,
                            threshold: this.settings.thresholds.forecast.confidenceThreshold
                        },
                        timestamp: new Date().toISOString(),
                        status: 'active',
                        category: 'forecast',
                        recommendations: this.getForecastRecommendations(prediction),
                        impact: 'medium',
                        urgency: 'low'
                    });
                }
                
                // تنبيه لزيادة متوقعة كبيرة
                const currentAverage = this.calculateAverage(data.slice(-6).map(r => parseFloat(r.abstraction) || 0));
                if (prediction.value > currentAverage * 1.3) {
                    alerts.push({
                        id: this.generateAlertId(),
                        type: 'predicted_high_consumption',
                        severity: 'medium',
                        title: 'زيادة متوقعة في الاستهلاك',
                        message: `التنبؤ يشير إلى زيادة كبيرة في الاستهلاك`,
                        details: {
                            currentAverage: currentAverage,
                            predictedValue: prediction.value,
                            increase: ((prediction.value / currentAverage - 1) * 100).toFixed(1),
                            period: prediction.period,
                            confidence: prediction.confidence
                        },
                        timestamp: new Date().toISOString(),
                        status: 'active',
                        category: 'forecast',
                        recommendations: this.getPredictedIncreaseRecommendations(prediction, currentAverage),
                        impact: 'high',
                        urgency: 'medium'
                    });
                }
            });
        } catch (error) {
            console.warn('فشل في إنشاء تنبيهات تنبؤية:', error);
        }
        
        return alerts;
    }

    // ========= معالجة التنبيهات =========
    processNewAlerts(newAlerts) {
        newAlerts.forEach(alert => {
            // تجنب التكرار
            if (!this.isDuplicateAlert(alert)) {
                this.alerts.push(alert);
                this.notifySubscribers(alert);
                this.logAlert(alert);
                
                // إجراءات آلية للتنبيهات الحرجة
                if (alert.severity === 'critical' || alert.urgency === 'high') {
                    this.triggerEmergencyResponse(alert);
                }
            }
        });
        
        // تنظيف التنبيهات القديمة
        this.cleanupOldAlerts();
    }

    // ========= إدارة الإشعارات =========
    notifySubscribers(alert) {
        this.subscribers.forEach((callback, subscriberId) => {
            try {
                callback(alert);
            } catch (error) {
                console.error(`خطأ في إشعار المشترك ${subscriberId}:`, error);
            }
        });
        
        // إشعارات النظام
        if (this.settings.notifications.dashboard.enabled) {
            this.showDashboardNotification(alert);
        }
        
        if (this.settings.notifications.sound.enabled && alert.severity === 'high') {
            this.playAlertSound(alert);
        }
    }

    // ========= حسابات مساعدة =========
    groupDataByWell(data) {
        const grouped = {};
        data.forEach(reading => {
            if (!grouped[reading.wellId]) {
                grouped[reading.wellId] = [];
            }
            grouped[reading.wellId].push(reading);
        });
        return grouped;
    }

    calculateHistoricalAverage(data) {
        if (data.length === 0) return 0;
        const values = data.map(r => parseFloat(r.abstraction) || 0);
        return this.calculateAverage(values);
    }

    calculateAverage(values) {
        if (values.length === 0) return 0;
        return values.reduce((sum, val) => sum + val, 0) / values.length;
    }

    calculateSeverity(current, baseline, type) {
        const ratio = current / baseline;
        
        if (ratio > 2.0) return 'critical';
        if (ratio > 1.5) return 'high';
        if (ratio > 1.2) return 'medium';
        return 'low';
    }

    calculateConsumptionTrend(data) {
        if (data.length < 3) return { isIncreasing: false, rate: 0 };
        
        const recent = data.slice(-3).map(r => parseFloat(r.abstraction) || 0);
        const older = data.slice(-6, -3).map(r => parseFloat(r.abstraction) || 0);
        
        const recentAvg = this.calculateAverage(recent);
        const olderAvg = this.calculateAverage(older);
        
        const rate = olderAvg > 0 ? (recentAvg - olderAvg) / olderAvg : 0;
        
        return {
            isIncreasing: rate > 0.05, // زيادة 5% أو أكثر
            rate: rate,
            current: recentAvg,
            projectedDays: rate > 0 ? Math.floor(30 / rate) : Infinity
        };
    }

    analyzePattern(data) {
        const values = data.map(r => parseFloat(r.abstraction) || 0);
        const mean = this.calculateAverage(values);
        const variance = this.calculateVariance(values, mean);
        const coefficientOfVariation = Math.sqrt(variance) / mean;
        
        return {
            irregularityScore: coefficientOfVariation,
            type: coefficientOfVariation > 0.5 ? 'highly_irregular' : 'moderately_irregular',
            anomalies: this.detectAnomalies(values),
            expected: mean,
            actual: values[values.length - 1]
        };
    }

    calculateVariance(values, mean) {
        return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    }

    detectAnomalies(values) {
        const mean = this.calculateAverage(values);
        const std = Math.sqrt(this.calculateVariance(values, mean));
        
        return values
            .map((val, index) => ({ value: val, index: index }))
            .filter(item => Math.abs(item.value - mean) > 2 * std);
    }

    calculateDataQualityMetrics(data) {
        const totalCount = data.length;
        const estimatedCount = data.filter(r => r.isEstimated).length;
        const estimatedRatio = totalCount > 0 ? estimatedCount / totalCount : 0;
        
        return {
            totalCount: totalCount,
            estimatedCount: estimatedCount,
            actualCount: totalCount - estimatedCount,
            estimatedRatio: estimatedRatio,
            qualityScore: 1 - estimatedRatio,
            wellsWithHighEstimation: this.findWellsWithHighEstimation(data)
        };
    }

    findWellsWithHighEstimation(data) {
        const wellsData = this.groupDataByWell(data);
        const problematicWells = [];
        
        Object.keys(wellsData).forEach(wellId => {
            const wellData = wellsData[wellId];
            const estimatedRatio = wellData.filter(r => r.isEstimated).length / wellData.length;
            
            if (estimatedRatio > 0.5) {
                problematicWells.push({
                    wellId: wellId,
                    estimatedRatio: estimatedRatio,
                    totalReadings: wellData.length
                });
            }
        });
        
        return problematicWells;
    }

    // ========= التوصيات =========
    getHighConsumptionRecommendations(wellId, current, historical) {
        return [
            'فحص نظام الضخ للتأكد من عدم وجود تسريبات',
            'مراجعة سجلات الصيانة والعمليات الأخيرة',
            'التحقق من دقة أجهزة القياس والعدادات',
            'مقارنة الاستهلاك مع الآبار المجاورة في نفس المنطقة',
            'تحليل العوامل الخارجية (الطقس، الموسم، النشاط)',
            'إجراء فحص شامل للبئر ومعداته'
        ];
    }

    getWaterLevelRecommendations(wellId, trend) {
        return [
            'مراقبة مستوى المياه بشكل أكثر تكراراً',
            'تقليل معدل الضخ إذا أمكن',
            'البحث عن مصادر مياه بديلة',
            'تحسين كفاءة استخدام المياه',
            'جدولة أوقات الضخ لتوزيع الأحمال'
        ];
    }

    getPatternRecommendations(wellId, analysis) {
        return [
            'مراجعة تواريخ ومواعيد القراءات',
            'التحقق من العوامل المؤثرة على الاستهلاك',
            'تحليل البيانات التاريخية لفهم النمط الطبيعي',
            'تحديث جدول القراءات والصيانة',
            'فحص أجهزة القياس والتحكم'
        ];
    }

    getDataQualityRecommendations(metrics) {
        return [
            'زيادة تكرار القراءات الفعلية',
            'تدريب الفريق على استخدام أجهزة القياس',
            'صيانة وضبط أجهزة القياس',
            'وضع جدول زمني منتظم للقراءات',
            'استخدام تقنيات قياس متقدمة'
        ];
    }

    getForecastRecommendations(prediction) {
        return [
            'تحسين جودة البيانات التاريخية',
            'زيادة تكرار القراءات',
            'تحديث نماذج التنبؤ',
            'مراجعة العوامل المؤثرة على الاستهلاك'
        ];
    }

    // ========= مساعدات النظام =========
    generateAlertId() {
        return 'alert_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    isDuplicateAlert(newAlert) {
        return this.alerts.some(existingAlert => 
            existingAlert.type === newAlert.type &&
            existingAlert.wellId === newAlert.wellId &&
            existingAlert.status === 'active' &&
            (Date.now() - new Date(existingAlert.timestamp).getTime()) < 24 * 60 * 60 * 1000 // خلال 24 ساعة
        );
    }

    startPeriodicChecks() {
        // فحص دوري كل ساعة
        setInterval(() => {
            this.performRoutineCheck();
        }, 60 * 60 * 1000);
    }

    performRoutineCheck() {
        // سيتم تطبيقها مع الواجهة الرئيسية
        console.log('إجراء فحص دوري للتنبيهات');
    }

    // ========= إدارة الإعدادات =========
    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        console.log('تم تحديث إعدادات التنبيهات');
    }

    subscribe(subscriberId, callback) {
        this.subscribers.set(subscriberId, callback);
    }

    unsubscribe(subscriberId) {
        this.subscribers.delete(subscriberId);
    }

    // ========= واجهة برمجة التطبيقات =========
    getActiveAlerts() {
        return this.alerts.filter(alert => alert.status === 'active');
    }

    getAlertsByType(type) {
        return this.alerts.filter(alert => alert.type === type);
    }

    getAlertsBySeverity(severity) {
        return this.alerts.filter(alert => alert.severity === severity);
    }

    acknowledgeAlert(alertId) {
        const alert = this.alerts.find(a => a.id === alertId);
        if (alert) {
            alert.status = 'acknowledged';
            alert.acknowledgedAt = new Date().toISOString();
        }
    }

    resolveAlert(alertId, resolution) {
        const alert = this.alerts.find(a => a.id === alertId);
        if (alert) {
            alert.status = 'resolved';
            alert.resolvedAt = new Date().toISOString();
            alert.resolution = resolution;
        }
    }
}

// تصدير الكلاس
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SmartAlertSystem };
}