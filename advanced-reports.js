// ========= نظام التقارير والتحليلات المتقدم =========

class AdvancedReportsEngine {
    constructor() {
        this.initializeEngine();
    }

    initializeEngine() {
        console.log('تم تهيئة محرك التقارير المتقدم');
        this.alertThresholds = {
            highConsumption: 1.5, // 150% من المعدل الطبيعي
            lowWaterLevel: 0.3,   // 30% من المستوى الطبيعي
            irregularPattern: 0.8, // انحراف 80% عن النمط
            outlierScore: 2.0      // Z-Score أعلى من 2
        };
    }

    // ========= تقارير شهرية وسنوية شاملة =========
    generateMonthlyReport(data, year, month) {
        const monthlyData = this.filterDataByMonth(data, year, month);
        
        const report = {
            period: { year, month, monthName: this.getMonthName(month) },
            summary: this.calculateMonthlySummary(monthlyData),
            trends: this.analyzeMonthlyTrends(monthlyData),
            qualityMetrics: this.calculateQualityMetrics(monthlyData),
            consumption: this.analyzeConsumptionPatterns(monthlyData),
            wells: this.analyzeWellsPerformance(monthlyData),
            alerts: this.generateMonthlyAlerts(monthlyData),
            recommendations: this.generateMonthlyRecommendations(monthlyData)
        };

        return report;
    }

    generateAnnualReport(data, year) {
        const annualData = this.filterDataByYear(data, year);
        
        const report = {
            period: { year },
            summary: this.calculateAnnualSummary(annualData),
            monthlyBreakdown: this.getMonthlyBreakdown(annualData),
            seasonalAnalysis: this.analyzeSeasonalPatterns(annualData),
            trends: this.analyzeAnnualTrends(annualData),
            performance: this.calculateAnnualPerformance(annualData),
            forecasting: this.generateAnnualForecast(annualData),
            achievements: this.calculateAchievements(annualData),
            recommendations: this.generateAnnualRecommendations(annualData)
        };

        return report;
    }

    // ========= المقارنات الزمنية =========
    generateComparativeReport(data, period1, period2, comparisonType = 'monthly') {
        const data1 = this.extractPeriodData(data, period1, comparisonType);
        const data2 = this.extractPeriodData(data, period2, comparisonType);

        const comparison = {
            periods: { period1, period2 },
            type: comparisonType,
            summary: this.compareSummaryMetrics(data1, data2),
            consumption: this.compareConsumption(data1, data2),
            wells: this.compareWellsPerformance(data1, data2),
            quality: this.compareDataQuality(data1, data2),
            trends: this.compareTrends(data1, data2),
            changes: this.identifySignificantChanges(data1, data2),
            insights: this.generateComparisonInsights(data1, data2)
        };

        return comparison;
    }

    // ========= تحليل الاتجاهات والتنبؤ =========
    analyzeTrends(data, analysisType = 'consumption') {
        const timeSeriesData = this.prepareTimeSeriesData(data, analysisType);
        
        return {
            currentTrend: this.calculateCurrentTrend(timeSeriesData),
            seasonalPattern: this.identifySeasonalPattern(timeSeriesData),
            cyclicalPattern: this.identifyCyclicalPattern(timeSeriesData),
            volatility: this.calculateVolatility(timeSeriesData),
            anomalies: this.detectTrendAnomalies(timeSeriesData),
            forecast: this.generateForecast(timeSeriesData)
        };
    }

    generateForecast(timeSeriesData, forecastPeriods = 6) {
        // تطبيق خوارزمية التنبؤ باستخدام Linear Regression مع Seasonal Adjustment
        const forecast = [];
        const trend = this.calculateLinearTrend(timeSeriesData);
        const seasonalFactors = this.calculateSeasonalFactors(timeSeriesData);
        
        const lastValue = timeSeriesData[timeSeriesData.length - 1];
        
        for (let i = 1; i <= forecastPeriods; i++) {
            const trendValue = trend.slope * (timeSeriesData.length + i) + trend.intercept;
            const seasonalAdjustment = seasonalFactors[(lastValue.period + i) % 12];
            const forecastValue = trendValue * seasonalAdjustment;
            
            forecast.push({
                period: lastValue.period + i,
                value: Math.max(0, forecastValue),
                confidence: this.calculateForecastConfidence(i, timeSeriesData),
                trend: trendValue,
                seasonal: seasonalAdjustment
            });
        }
        
        return forecast;
    }

    // ========= التنبيهات الذكية =========
    generateSmartAlerts(data) {
        const alerts = [];
        
        // تحليل الاستهلاك الزائد
        const highConsumptionAlerts = this.detectHighConsumption(data);
        alerts.push(...highConsumptionAlerts);
        
        // تحليل انخفاض مستوى المياه
        const lowWaterLevelAlerts = this.detectLowWaterLevel(data);
        alerts.push(...lowWaterLevelAlerts);
        
        // تحليل الأنماط غير العادية
        const irregularPatternAlerts = this.detectIrregularPatterns(data);
        alerts.push(...irregularPatternAlerts);
        
        // تحليل جودة البيانات
        const dataQualityAlerts = this.detectDataQualityIssues(data);
        alerts.push(...dataQualityAlerts);
        
        // ترتيب التنبيهات حسب الأولوية
        return this.prioritizeAlerts(alerts);
    }

    detectHighConsumption(data) {
        const alerts = [];
        const wellsData = this.groupDataByWell(data);
        
        Object.keys(wellsData).forEach(wellId => {
            const wellData = wellsData[wellId];
            const avgConsumption = this.calculateAverageConsumption(wellData);
            const recentConsumption = this.getRecentConsumption(wellData);
            
            if (recentConsumption > avgConsumption * this.alertThresholds.highConsumption) {
                alerts.push({
                    type: 'high_consumption',
                    severity: 'high',
                    wellId: wellId,
                    message: `استهلاك مرتفع للبئر ${wellId}: ${recentConsumption.toFixed(2)} م³`,
                    details: {
                        current: recentConsumption,
                        average: avgConsumption,
                        increase: ((recentConsumption / avgConsumption - 1) * 100).toFixed(1)
                    },
                    timestamp: new Date().toISOString(),
                    recommendations: this.getHighConsumptionRecommendations(wellId, recentConsumption, avgConsumption)
                });
            }
        });
        
        return alerts;
    }

    detectLowWaterLevel(data) {
        const alerts = [];
        // هنا يمكن إضافة منطق كشف انخفاض مستوى المياه
        // بناءً على بيانات المستوى إذا كانت متوفرة
        
        return alerts;
    }

    detectIrregularPatterns(data) {
        const alerts = [];
        const wellsData = this.groupDataByWell(data);
        
        Object.keys(wellsData).forEach(wellId => {
            const wellData = wellsData[wellId];
            const pattern = this.analyzeConsumptionPattern(wellData);
            
            if (pattern.irregularityScore > this.alertThresholds.irregularPattern) {
                alerts.push({
                    type: 'irregular_pattern',
                    severity: 'medium',
                    wellId: wellId,
                    message: `نمط استهلاك غير منتظم للبئر ${wellId}`,
                    details: {
                        irregularityScore: pattern.irregularityScore,
                        patternType: pattern.type,
                        anomalies: pattern.anomalies
                    },
                    timestamp: new Date().toISOString(),
                    recommendations: this.getIrregularPatternRecommendations(wellId, pattern)
                });
            }
        });
        
        return alerts;
    }

    // ========= حسابات مساعدة =========
    filterDataByMonth(data, year, month) {
        return data.filter(reading => {
            const date = new Date(reading.readingDate);
            return date.getFullYear() === year && date.getMonth() + 1 === month;
        });
    }

    filterDataByYear(data, year) {
        return data.filter(reading => {
            const date = new Date(reading.readingDate);
            return date.getFullYear() === year;
        });
    }

    calculateMonthlySummary(data) {
        return {
            totalReadings: data.length,
            totalConsumption: this.calculateTotalConsumption(data),
            averageConsumption: this.calculateAverageConsumption(data),
            activeWells: this.countActiveWells(data),
            estimatedReadings: this.countEstimatedReadings(data),
            dataQualityScore: this.calculateDataQualityScore(data)
        };
    }

    calculateAnnualSummary(data) {
        const monthly = this.getMonthlyBreakdown(data);
        
        return {
            totalReadings: data.length,
            totalConsumption: this.calculateTotalConsumption(data),
            averageMonthlyConsumption: monthly.reduce((sum, m) => sum + m.consumption, 0) / 12,
            peakMonth: monthly.reduce((max, m) => m.consumption > max.consumption ? m : max),
            lowMonth: monthly.reduce((min, m) => m.consumption < min.consumption ? m : min),
            growthRate: this.calculateAnnualGrowthRate(monthly),
            dataQualityScore: this.calculateDataQualityScore(data)
        };
    }

    getMonthlyBreakdown(data) {
        const months = {};
        
        data.forEach(reading => {
            const date = new Date(reading.readingDate);
            const monthKey = date.getMonth() + 1;
            
            if (!months[monthKey]) {
                months[monthKey] = {
                    month: monthKey,
                    monthName: this.getMonthName(monthKey),
                    readings: [],
                    consumption: 0
                };
            }
            
            months[monthKey].readings.push(reading);
        });
        
        // حساب الاستهلاك لكل شهر
        Object.keys(months).forEach(monthKey => {
            months[monthKey].consumption = this.calculateTotalConsumption(months[monthKey].readings);
        });
        
        return Object.values(months).sort((a, b) => a.month - b.month);
    }

    analyzeSeasonalPatterns(data) {
        const monthlyData = this.getMonthlyBreakdown(data);
        
        const seasons = {
            winter: [12, 1, 2],
            spring: [3, 4, 5],
            summer: [6, 7, 8],
            autumn: [9, 10, 11]
        };
        
        const seasonalAnalysis = {};
        
        Object.keys(seasons).forEach(season => {
            const seasonMonths = seasons[season];
            const seasonData = monthlyData.filter(m => seasonMonths.includes(m.month));
            
            seasonalAnalysis[season] = {
                totalConsumption: seasonData.reduce((sum, m) => sum + m.consumption, 0),
                averageConsumption: seasonData.reduce((sum, m) => sum + m.consumption, 0) / seasonData.length,
                peakMonth: seasonData.reduce((max, m) => m.consumption > max.consumption ? m : max, seasonData[0]),
                trend: this.calculateSeasonalTrend(seasonData)
            };
        });
        
        return seasonalAnalysis;
    }

    generateMonthlyRecommendations(data) {
        const recommendations = [];
        const summary = this.calculateMonthlySummary(data);
        
        // توصيات بناءً على جودة البيانات
        if (summary.dataQualityScore < 0.7) {
            recommendations.push({
                type: 'data_quality',
                priority: 'high',
                title: 'تحسين جودة البيانات',
                description: 'نسبة البيانات المقدرة مرتفعة، يُنصح بزيادة دقة القراءات الفعلية',
                action: 'إجراء قراءات فعلية إضافية للآبار ذات القراءات المقدرة العالية'
            });
        }
        
        // توصيات بناءً على الاستهلاك
        if (summary.averageConsumption > this.calculateHistoricalAverage(data)) {
            recommendations.push({
                type: 'consumption',
                priority: 'medium',
                title: 'مراقبة الاستهلاك',
                description: 'الاستهلاك أعلى من المعدل التاريخي',
                action: 'مراجعة أنماط الاستهلاك وتحديد أسباب الزيادة'
            });
        }
        
        return recommendations;
    }

    calculateTotalConsumption(data) {
        return data.reduce((total, reading) => {
            return total + (parseFloat(reading.abstraction) || 0);
        }, 0);
    }

    calculateAverageConsumption(data) {
        if (data.length === 0) return 0;
        return this.calculateTotalConsumption(data) / data.length;
    }

    countActiveWells(data) {
        const uniqueWells = new Set(data.map(reading => reading.wellId));
        return uniqueWells.size;
    }

    countEstimatedReadings(data) {
        return data.filter(reading => reading.isEstimated).length;
    }

    calculateDataQualityScore(data) {
        if (data.length === 0) return 1;
        
        const actualReadings = data.filter(reading => !reading.isEstimated).length;
        const totalReadings = data.length;
        
        return actualReadings / totalReadings;
    }

    getMonthName(month) {
        const monthNames = [
            '', 'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
            'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
        ];
        return monthNames[month];
    }

    calculateHistoricalAverage(data) {
        // حساب المتوسط التاريخي للبيانات
        return this.calculateAverageConsumption(data);
    }

    prioritizeAlerts(alerts) {
        const priorityOrder = { 'high': 3, 'medium': 2, 'low': 1 };
        return alerts.sort((a, b) => priorityOrder[b.severity] - priorityOrder[a.severity]);
    }

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

    getHighConsumptionRecommendations(wellId, current, average) {
        return [
            'فحص نظام الضخ للتأكد من عدم وجود تسريبات',
            'مراجعة سجلات الصيانة الأخيرة',
            'التحقق من دقة أجهزة القياس',
            'مقارنة الاستهلاك مع الآبار المجاورة'
        ];
    }

    getIrregularPatternRecommendations(wellId, pattern) {
        return [
            'مراجعة تواريخ القراءات للتأكد من انتظامها',
            'فحص العوامل الخارجية المؤثرة على الاستهلاك',
            'تحليل البيانات التاريخية لفهم النمط',
            'تحديث جدول القراءات إذا لزم الأمر'
        ];
    }

    // ========= تصدير التقارير =========
    exportReportToPDF(reportData, reportType) {
        // سيتم تطبيقها لاحقاً مع مكتبة PDF
        console.log(`تصدير تقرير ${reportType} إلى PDF`);
    }

    exportReportToExcel(reportData, reportType) {
        // سيتم تطبيقها لاحقاً مع مكتبة Excel
        console.log(`تصدير تقرير ${reportType} إلى Excel`);
    }
}

// ========= كلاس المقارنات الزمنية =========
class TimeSeriesComparison {
    constructor() {
        this.comparisonTypes = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'];
    }

    comparePerformance(data1, data2, metrics = ['consumption', 'quality', 'efficiency']) {
        const comparison = {};
        
        metrics.forEach(metric => {
            comparison[metric] = this.calculateMetricComparison(data1, data2, metric);
        });
        
        return comparison;
    }

    calculateMetricComparison(data1, data2, metric) {
        const value1 = this.calculateMetricValue(data1, metric);
        const value2 = this.calculateMetricValue(data2, metric);
        
        const change = value2 - value1;
        const changePercent = value1 !== 0 ? (change / value1) * 100 : 0;
        
        return {
            period1: value1,
            period2: value2,
            change: change,
            changePercent: changePercent,
            trend: change > 0 ? 'increasing' : change < 0 ? 'decreasing' : 'stable',
            significance: Math.abs(changePercent) > 10 ? 'significant' : 'minor'
        };
    }

    calculateMetricValue(data, metric) {
        switch (metric) {
            case 'consumption':
                return data.reduce((sum, reading) => sum + (parseFloat(reading.abstraction) || 0), 0);
            case 'quality':
                return data.filter(reading => !reading.isEstimated).length / data.length;
            case 'efficiency':
                return this.calculateEfficiencyScore(data);
            default:
                return 0;
        }
    }

    calculateEfficiencyScore(data) {
        // حساب درجة الكفاءة بناءً على عدة عوامل
        const qualityScore = data.filter(reading => !reading.isEstimated).length / data.length;
        const consistencyScore = this.calculateConsistencyScore(data);
        
        return (qualityScore + consistencyScore) / 2;
    }

    calculateConsistencyScore(data) {
        if (data.length < 2) return 1;
        
        const values = data.map(reading => parseFloat(reading.abstraction) || 0);
        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
        const coefficient = Math.sqrt(variance) / mean;
        
        // كلما قل معامل التباين، زادت درجة الاتساق
        return Math.max(0, 1 - coefficient);
    }
}

// تصدير الكلاسات
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AdvancedReportsEngine, TimeSeriesComparison };
}