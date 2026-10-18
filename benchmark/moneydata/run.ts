/** Entry point: prints the MoneyData evaluation as JSON. */
import { run } from './evaluate'
console.log(JSON.stringify(run(), null, 1))
