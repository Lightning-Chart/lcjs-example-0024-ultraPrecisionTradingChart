/*
 * line chart with 1 microsecond precision data
 * 3 series, display a 2.5 second interval, total data points = 7.5 million
 */
// Import LightningChartJS
const lcjs = require('@arction/lcjs')

// Import xydata
const xydata = require('@arction/xydata')

const { AxisTickStrategies, emptyFill, lightningChart, Themes } = lcjs
const { createProgressiveTraceGenerator } = xydata

const CHANNELS = 3
const DATA_PER_CHANNEL = 2.5 * 1000 * 1000
const STEP_X = 10 ** -3

const chart = lightningChart({
            resourcesBaseUrl: new URL(document.head.baseURI).origin + new URL(document.head.baseURI).pathname + 'resources/',
        })
    .ChartXY({
        theme: Themes[new URLSearchParams(window.location.search).get('theme') || 'darkGold'] || undefined,
    })
    .setTitle(`3 stock price trends with 1 microsecond data resolution (total ${DATA_PER_CHANNEL * CHANNELS} values)`)
const axisX = chart.getDefaultAxisX().setTickStrategy(AxisTickStrategies.Time)
chart.getDefaultAxisY().dispose()
const channelList = new Array(CHANNELS).fill(0).map((_, i) => {
    const chName = '<Stock name>'
    const iStack = CHANNELS - (i + 1)
    const axisY = chart
        .addAxisY({ iStack })
        .setTitle(chName)
        .setMargins(iStack > 0 ? 15 : 0, iStack < CHANNELS.length - 1 ? 15 : 0)
    const series = chart
        .addPointLineAreaSeries({
            yAxis: axisY,
            dataPattern: 'ProgressiveX',
            automaticColorIndex: i * 2,
        })
        .setAreaFillStyle(emptyFill)
        .setName(chName)
        .setCursorInterpolationEnabled(false)
        .setCursorResultTableFormatter((builder, _, sample) =>
            builder.addRow(series.axisX.formatValue(sample.x)).addRow(chName, '', `${sample.y.toFixed(0)} €`),
        )
    return { chart, series }
})

Promise.all(
    channelList.map((ch, i) =>
        createProgressiveTraceGenerator()
            .setNumberOfPoints(DATA_PER_CHANNEL)
            .generate()
            .toPromise()
            .then((xyTrace) => {
                // Map generated XY trace data set into a more realistic data set.
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
    channelList.forEach((ch, i) => {
        ch.series.appendJSON(dataSets[i])
        ch.series.axisX.fit(false)
    })

    // Customize chart interactions.
    channelList.forEach((ch) => {
        ch.chart.setMouseInteractions(false)
        ch.chart.getDefaultAxisX().setMouseInteractions(false)
    })

    // Create custom chart interaction for mouse dragging inside chart area.
    const xBandList = channelList.map((ch) => ch.chart.getDefaultAxisX().addBand().setVisible(false))
    channelList.forEach((ch) => {
        const chart = ch.chart
        const axisX = chart.getDefaultAxisX()
        const axisY = chart.getDefaultAxisY()
        chart.setMouseInteractionRectangleFit(false).setMouseInteractionRectangleZoom(false)
        chart.onSeriesBackgroundMouseDrag((_, event, button, startLocation, delta) => {
            if (button !== 0) return

            xBandList.forEach((band, i) => {
                const bandChart = channelList[i].chart
                const xAxisLocationStart = bandChart.translateCoordinate(
                    { clientX: startLocation.x, clientY: startLocation.y },
                    bandChart.coordsAxis,
                ).x
                const xAxisLocationNow = bandChart.translateCoordinate(event, bandChart.coordsAxis).x
                if (Math.abs(event.clientX - startLocation.x) > 10) {
                    band.setVisible(true).setValueStart(xAxisLocationStart).setValueEnd(xAxisLocationNow)
                } else {
                    band.setVisible(false)
                }
            })
        })
        chart.onSeriesBackgroundMouseDragStop((_, event, button, startLocation) => {
            if (button !== 0 || !xBandList[0].getVisible()) return

            const xStart = Math.min(xBandList[0].getValueStart(), xBandList[0].getValueEnd())
            const xEnd = Math.max(xBandList[0].getValueStart(), xBandList[0].getValueEnd())
            channelList[0].chart.getDefaultAxisX().setInterval({ start: xStart, end: xEnd })
            xBandList.forEach((band, i) => {
                band.setVisible(false)
            })
        })
        chart.onSeriesBackgroundMouseDoubleClick((_, event) => {
            if (event.button !== 0) return
            channelList.forEach((ch) => {
                ch.chart.getDefaultAxisX().fit(false)
                ch.chart.getDefaultAxisY().fit(false)
            })
        })
    })
})
