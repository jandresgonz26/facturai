// Format date from YYYY-MM-DD to DD/MM/YYYY
export const formatDate = (dateString: string): string => {
    if (!dateString) return ''
    const [year, month, day] = dateString.split('-')
    return `${day}/${month}/${year}`
}

// Format date from Date object to DD/MM/YYYY
export const formatDateFromObject = (date: Date): string => {
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    return `${day}/${month}/${year}`
}
