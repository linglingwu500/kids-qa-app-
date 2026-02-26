import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-cn'

dayjs.extend(relativeTime)
dayjs.locale('zh-cn')

/**
 * 格式化时间为相对时间
 */
export function formatRelativeTime(time: string): string {
  return dayjs(time).fromNow()
}

/**
 * 格式化时间为完整日期
 */
export function formatFullTime(time: string): string {
  return dayjs(time).format('YYYY年MM月DD日 HH:mm')
}

/**
 * 格式化时间为短日期
 */
export function formatDate(time: string): string {
  return dayjs(time).format('MM月DD日')
}
