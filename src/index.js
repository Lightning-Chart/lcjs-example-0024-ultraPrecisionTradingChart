/*
 * line chart with 1 microsecond precision data
 * 3 series, display a 2.5 second interval, total data points = 7.5 million
 */
// Import LightningChartJS
const lcjs = require('@lightningchart/lcjs')

// Import xydata
const xydata = require('@lightningchart/xydata')

const { AxisTickStrategies, emptyFill, lightningChart, DataSetXY, Themes } = lcjs
const { createMultiChannelTraceGenerator } = xydata

const CHANNELS = 3
const DATA_PER_CHANNEL = 2.5 * 1000 * 1000
const STEP_X = 10 ** -3

const chart = lightningChart({
            resourcesBaseUrl: new URL(document.head.baseURI).origin + new URL(document.head.baseURI).pathname + 'resources/',
        })
    .ChartXY({
        legend: { visible: false },
        theme: Themes[new URLSearchParams(window.location.search).get('theme') || 'darkGold'] || undefined,
    })
    .setTitle(`3 stock price trends with 1 microsecond data resolution (total ${DATA_PER_CHANNEL * CHANNELS} values)`)
const axisX = chart.getDefaultAxisX().setTickStrategy(AxisTickStrategies.Time)
chart.getDefaultAxisY().dispose()

// Single data set with shared timestamps
const dataSet = new DataSetXY({
    schema: {
        x: { pattern: 'progressive' },
        ...Object.fromEntries(Array.from({ length: CHANNELS }, (_, i) => [`y${i}`, { pattern: null }])),
    },
})

const channelList = new Array(CHANNELS).fill(0).map((_, i) => {
    const chName = '<Stock name>'
    const iStack = CHANNELS - (i + 1)
    const axisY = chart
        .addAxisY({ iStack })
        .setTitle(chName)
        .setMargins(iStack > 0 ? 5 : 0, iStack < CHANNELS - 1 ? 5 : 0)
    const series = chart
        .addLineSeries({
            yAxis: axisY,
            automaticColorIndex: i * 2,
        })
        .setName(chName)
        .setDataSet(dataSet, { x: 'x', y: `y${i}` })
    return { chart, series }
})

createMultiChannelTraceGenerator()
    .setNumberOfChannels(channelList.length)
    .setNumberOfPoints(DATA_PER_CHANNEL)
    .generate()
    .then((data) => {
        // Map generated XY trace data set into a more realistic data set.
        return Object.fromEntries(
            Object.entries(data).map(([key, value]) => {
                if (key === 'x') return [key, value.map((x) => x * STEP_X)]
                const baseLine = 10 + Math.random() * 2000
                const variationAmplitude = baseLine * 0.03
                const yMin = value.reduce((min, cur) => Math.min(min, cur), Number.MAX_SAFE_INTEGER)
                const yMax = value.reduce((max, cur) => Math.max(max, cur), -Number.MAX_SAFE_INTEGER)
                const yIntervalHalf = (yMax - yMin) / 2
                const yTraceBaseline = yMin + yIntervalHalf
                return [key, value.map((y) => baseLine + ((y - yTraceBaseline) / yIntervalHalf) * variationAmplitude)]
            }),
        )
    })
    .then((data) => {
        dataSet.appendSamples(data)
        chart.axisX.fit(false)
    })
