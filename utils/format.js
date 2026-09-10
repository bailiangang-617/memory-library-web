function pad(num) {
  return num < 10 ? `0${num}` : `${num}`
}

function toDate(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatDateTime(value) {
  const date = toDate(value)
  if (!date) return '时间未知'
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatDate(value) {
  const date = toDate(value)
  if (!date) return '时间未知'
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function formatMonthKey(value) {
  const date = toDate(value)
  if (!date) return 'unknown'
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
}

function formatMonthLabel(value) {
  const date = toDate(value)
  if (!date) return '时间未知'
  return `${date.getFullYear()}年${date.getMonth() + 1}月`
}

function formatRange(start, end) {
  const a = toDate(start)
  const b = toDate(end)
  if (!a && !b) return ''
  if (a && b && formatDate(a) === formatDate(b)) return formatDate(a)
  if (a && b) return `${formatDate(a)} 至 ${formatDate(b)}`
  return formatDate(a || b)
}

module.exports = {
  formatDateTime,
  formatDate,
  formatMonthKey,
  formatMonthLabel,
  formatRange
}
