import { format } from "date-fns";


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

export const formatDate = (date: string) => {
  const deliveryDate = new Date(date);
  const currentYear = new Date().getFullYear();
  const deliveryYear = deliveryDate.getFullYear();
  return deliveryYear < currentYear ? format(deliveryDate, "MMM d, ''yy") : format(deliveryDate, "MMM d");
}