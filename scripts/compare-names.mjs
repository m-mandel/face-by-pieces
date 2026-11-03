// CLI for the same similarity rules used by the game.
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { compareNames } from '../src/nameSimilarity.js'
export { compareNames, editDistance } from '../src/nameSimilarity.js'

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [guess, ...targets] = process.argv.slice(2)
  if (guess === undefined || targets.length === 0) {
    console.error('Usage: npm run compare:names -- "Jokoviz" "Novak Djokovic" "Djokovic"')
    process.exitCode = 1
  } else {
    try {
      console.log(JSON.stringify(compareNames(guess, targets), null, 2))
    } catch (error) {
      console.error(error.message)
      process.exitCode = 1
    }
  }
}
