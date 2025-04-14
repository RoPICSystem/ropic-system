
export const baseURL = () => {
  const env = process.env.NODE_ENV
  console.log(`env: ${env}`)

  if (env == "development") {
    return 'http://0.0.0.0:3000'
  }
  else if (env == "production") {
    return 'https://ropic-system.vercel.app/'
  }
}
