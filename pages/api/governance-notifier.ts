import type { VercelRequest, VercelResponse } from '@vercel/node'
import { runNotifier } from '../../scripts/governance-notifier'

export default async function (req: VercelRequest, res: VercelResponse) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).send('Unauthorized')
  }

  try {
    await runNotifier()
    res.status(200).send('Notifier executed successfully')
  } catch (error) {
    console.error(error)
    res.status(500).send('Error executing notifier')
  }
}
