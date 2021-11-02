// Trading line chart with 1 microsecond precision data
// 3 series, display a 2.5 second interval, total data points = 7.5 million

const lcjs = require('@arction/lcjs')
const xydata = require('@arction/xydata')
const {
    AxisTickStrategies,
    emptyFill,
    emptyLine,
    synchronizeAxisIntervals,
    translatePoint,
    lightningChart,
    UIOrigins,
    UIElementBuilders,
    UILayoutBuilders,
    AutoCursorModes,
    Themes
} = lcjs
const {
    createProgressiveTraceGenerator
} = xydata

const CHANNELS = 3
const DATA_PER_CHANNEL = 2.5 * 1000 * 1000
const STEP_X = 10 ** -3

const dashboard = lightningChart().Dashboard({
    numberOfColumns: 1,
    numberOfRows: CHANNELS,
    disableAnimations: true,
    // theme: Themes.darkGold
})

const chartList = new Array(CHANNELS).fill(0).map((_, i) => {
    const chart = dashboard
        .createChartXY({
            columnIndex: 0,
            rowIndex: i,
        })
        .setPadding({ right: 80 })

    if (i > 0) {
        chart.setTitleFillStyle(emptyFill)
    } else {
        chart.setTitle(`3 stock price trends with 1 microsecond data resolution (total ${DATA_PER_CHANNEL * CHANNELS} values)`)
    }

    const axisX = chart.getDefaultAxisX().setThickness({ min: 30 }).setTickStrategy(AxisTickStrategies.Time)
    const axisY = chart.getDefaultAxisY().setTitle('Price (€)').setThickness({ min: 80 })

    const uiLayout = chart
        .addUIElement(UILayoutBuilders.Column, { x: chart.getDefaultAxisX(), y: chart.getDefaultAxisY() })
        .setOrigin(UIOrigins.LeftTop)
        .setPosition({ x: chart.getDefaultAxisX().getInterval().start, y: chart.getDefaultAxisY().getInterval().end })
        .setMouseInteractions(false)
        .setBackground((background) => background.setStrokeStyle(emptyLine))
    chart.getDefaultAxisX().onScaleChange((start, end) => uiLayout.setPosition({ x: start, y: chart.getDefaultAxisY().getInterval().end }))
    chart.getDefaultAxisY().onScaleChange((start, end) => uiLayout.setPosition({ x: chart.getDefaultAxisX().getInterval().start, y: end }))
    uiLayout
        .addElement(UIElementBuilders.TextBox)
        .setText('< Stock name >')
        .setTextFont((font) => font.setSize(8))

    return chart
})

const seriesList = chartList.map((chart, i) => {
    const series = chart
        .addLineSeries({
            dataPattern: {
                pattern: 'ProgressiveX',
            },
            automaticColorIndex: i * 2,
        })
        .setName('< Stock name >')
        .setCursorInterpolationEnabled(false)
    return series
})

synchronizeAxisIntervals(...chartList.map((chart) => chart.getDefaultAxisX()))

Promise.all(
    seriesList.map((series, i) =>
        createProgressiveTraceGenerator()
            .setNumberOfPoints(DATA_PER_CHANNEL)
            .generate()
            .toPromise()
            .then((xyTrace) => {
                // Map generated XY trace data set into a more realistic trading data set.
                const baseLine = 10 + Math.random() * 2000
                const variationAmplitude = baseLine * 0.03
                const yMin = xyTrace.reduce((min, cur) => Math.min(min, cur.y), Number.MAX_SAFE_INTEGER)
                const yMax = xyTrace.reduce((max, cur) => Math.max(max, cur.y), -Number.MAX_SAFE_INTEGER)
                const yIntervalHalf = (yMax - yMin) / 2
                const yTraceBaseline = yMin + yIntervalHalf
                return xyTrace.map((xy) => ({
                    x: xy.x * STEP_X,
                    y: baseLine + ((xy.y - yTraceBaseline) / yIntervalHalf) * variationAmplitude,
                }))
            }),
    ),
).then((dataSets) => {
    seriesList.forEach((series, i) => {
        series.add(dataSets[i])
    })

    // Customize chart interactions.
    chartList.forEach((chart) => {
        chart.setMouseInteractions(false)
        chart.getDefaultAxisX().setMouseInteractions(false)
    })

    // Create custom chart interaction for mouse dragging inside chart area.
    const xBandList = chartList.map((chart) => chart.getDefaultAxisX().addBand().dispose())
    chartList.forEach((chart) => {
        const axisX = chart.getDefaultAxisX()
        const axisY = chart.getDefaultAxisY()
        chart.setMouseInteractionRectangleFit(false).setMouseInteractionRectangleZoom(false)
        chart.onSeriesBackgroundMouseDrag((_, event, button, startLocation, delta) => {
            if (button !== 0) return

            xBandList.forEach((band, i) => {
                const bandChart = chartList[i]
                const xAxisLocationStart = translatePoint(
                    bandChart.engine.clientLocation2Engine(startLocation.x, startLocation.y),
                    bandChart.engine.scale,
                    { x: axisX, y: axisY },
                ).x
                const xAxisLocationNow = translatePoint(
                    bandChart.engine.clientLocation2Engine(event.clientX, event.clientY),
                    bandChart.engine.scale,
                    { x: axisX, y: axisY },
                ).x
                if (Math.abs(event.clientX - startLocation.x) > 10) {
                    band.restore().setValueStart(xAxisLocationStart).setValueEnd(xAxisLocationNow)
                } else {
                    band.dispose()
                }
            })
        })
        chart.onSeriesBackgroundMouseDragStop((_, event, button, startLocation) => {
            if (button !== 0 || xBandList[0].isDisposed()) return

            const xStart = Math.min(xBandList[0].getValueStart(), xBandList[0].getValueEnd())
            const xEnd = Math.max(xBandList[0].getValueStart(), xBandList[0].getValueEnd())
            chartList[0].getDefaultAxisX().setInterval(xStart, xEnd, false, true)
            xBandList.forEach((band, i) => {
                const nChart = chartList[i]
                let yMin = 999999
                let yMax = -999999
                for (let x = xStart; x < xEnd; x += STEP_X) {
                    const dp = dataSets[i][Math.round(x / STEP_X)]
                    if (dp !== undefined) {
                        yMin = Math.min(yMin, dp.y)
                        yMax = Math.max(yMax, dp.y)
                    }
                }
                nChart.getDefaultAxisY().setInterval(yMin, yMax, false, true)
                band.dispose()
            })
        })
        chart.onSeriesBackgroundMouseDoubleClick((_, event) => {
            if (event.button !== 0) return

            fitActive = true
            chartList.forEach((nChart) => {
                nChart.getDefaultAxisX().fit(false)
                nChart.getDefaultAxisY().fit(false)
            })
            fitActive = false
        })
    })

    let fitActive = false
    // When X Axis interval is changed, automatically fit Y axis based on visible data.
    chartList.forEach((chart, i) => {
        chart.getDefaultAxisX().onScaleChange((xStart, xEnd) => {
            if (fitActive) return

            let yMin = 999999
            let yMax = -999999
            for (let x = xStart; x < xEnd; x += STEP_X) {
                const dp = dataSets[i][Math.round(x / STEP_X)]
                if (dp !== undefined) {
                    yMin = Math.min(yMin, dp.y)
                    yMax = Math.max(yMax, dp.y)
                }
            }
            if (yMin < 999999) {
                chart.getDefaultAxisY().setInterval(yMin, yMax, false, true)
            }
        })
    })
})

// Setup custom data cursor.
const resultTable = dashboard.addUIElement(UILayoutBuilders.Column, dashboard.engine.scale)
    .setMouseInteractions(false)
    .setOrigin(UIOrigins.LeftBottom)
    .setMargin(5)
const resultTableRows = new Array(1 + CHANNELS).fill(0).map(_ => resultTable.addElement(UIElementBuilders.TextBox))
resultTable.dispose()
const xTicks = chartList.map((chart) => chart.getDefaultAxisX().addCustomTick().dispose())

chartList.forEach((chart) => {
    chart.setAutoCursorMode(AutoCursorModes.disabled)
    chart.onSeriesBackgroundMouseMove((_, event) => {
        const mouseLocationEngine = chart.engine.clientLocation2Engine(event.clientX, event.clientY)
        const mouseLocationAxisX = translatePoint(mouseLocationEngine, chart.engine.scale, { x: chart.getDefaultAxisX(), y: chart.getDefaultAxisY() }).x
        resultTableRows[0].setText(chart.getDefaultAxisX().formatValue(mouseLocationAxisX))
        for (let i = 0; i < CHANNELS; i += 1) {
            const series = seriesList[i]
            const nearestDataPoint = series.solveNearestFromScreen(mouseLocationEngine)
            resultTableRows[1 + i].setText(series.getName() + ': ' + (nearestDataPoint ? chart.getDefaultAxisY().formatValue(nearestDataPoint.location.y) + ' €' : ''))
        }
        resultTable
            .restore()
            .setPosition(mouseLocationEngine)
        xTicks.forEach((xTick) => xTick
            .restore()
            .setValue(mouseLocationAxisX)
        )
    })
    chart.onSeriesBackgroundMouseDragStart(() => {
        resultTable.dispose()
        xTicks.forEach((xTick) => xTick.dispose())
    })
    chart.onSeriesBackgroundMouseLeave(() => {
        resultTable.dispose()
        xTicks.forEach((xTick) => xTick.dispose())
    })
})
