import { addToast } from "@heroui/react";
import { format } from "date-fns";
import { Icon, loadIcon } from "@iconify/react";


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

export const formatNumber = (value: number): string => {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3
  });
};

export const copyToClipboard = (str: string): void => {
  navigator.clipboard.writeText(str).then(() => {
    addToast({
      title: "Text copied successfully",
      variant: "solid",
      timeout: 2000,
      classNames: {
        base: "bg-default-50",
        wrapper: "p-2",
        closeButton: "opacity-100 absolute right-4 w-8 h-8 rounded-full top-1/2 translate-y-[-50%]"
      },
      closeIcon: (
        <Icon icon="mdi:close"
          className="bg-default-100/50 p-1 hover:bg-default-200 transition-all duration-200 text-default-800"
          width={32} height={32} />
      ),
    })

  });
}

export const showErrorToast = (error: string = "Error", message: string = '') => {
  console.error(error, message);
  
  addToast({
    ...(message && {description: message.length > 50 ? message.substring(0, 50) + '...' : message}),
    variant: "solid",
    color: "danger",
    timeout: 5000,
    title: error,
    classNames: {
      wrapper: "p-2",
      closeButton: "opacity-100 absolute right-4 w-8 h-8 rounded-full top-1/2 translate-y-[-50%]",
      icon: "-mr-2 ml-1"
    },
    closeIcon: (
      <Icon icon="mdi:close"
        className="dark:bg-danger-500/50 bg-danger-300/50 hover:bg-danger-300 hover:dark:bg-danger-500 p-1 transition-all duration-200 dark:text-danger-100 text-danger-900"
        width={32} height={32} />
    ),
  });
}

export const toSnakeCase = (str: string) => {
  return str.toLowerCase().replace(/\s+/g, '_');
}

export const toNormalCase = (str: string) => {
  return str.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

export const toSentenceCase = (str: string) => {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// to title case
export const toTitleCase = (str: string) => {
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}