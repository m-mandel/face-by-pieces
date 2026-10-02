export const CATEGORIES = [
  { id: 'all', label: 'All', labels: [] },
  { id: 'politics', label: 'Politics', labels: ['politics'] },
  {
    id: 'science-technology',
    label: 'Science and Technology',
    labels: ['science', 'technology'],
  },
  {
    id: 'film-art-music',
    label: 'Film, Art & Music',
    labels: ['film', 'art', 'music'],
  },
  { id: 'sports', label: 'Sports', labels: ['sports'] },
]

export function matchesCategory(portrait, categoryId) {
  if (categoryId === 'all') return true
  const category = CATEGORIES.find((option) => option.id === categoryId)
  return category?.labels.some((label) => portrait.labels.includes(label)) ?? false
}
