import 'dotenv/config'
import { buildConfig } from './buildConfig.js'

const config = buildConfig(process.env)

export default config