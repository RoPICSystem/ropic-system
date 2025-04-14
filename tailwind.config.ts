const { heroui } = require("@heroui/react");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
    "./node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}",],
  theme: {
    extend: {},
  },
  plugins: [
    function({ addVariant }: { addVariant: (name: string, definition: string) => void }) {
      addVariant('firefox', ':-moz-any(&)')
      addVariant('chrome', ':-webkit-any(&)')
      addVariant('safari', ':-webkit-any(&)')
      addVariant('edge', ':-ms-any(&)')
    },
    heroui({
      prefix: "heroui", // prefix for themes variables
      addCommonColors: false, // override common colors (e.g. "blue", "green", "pink").
      themes: {
        "light": {
          "colors": {
            "default": {
              "50": "#f8f5f2",
              "100": "#eee7e0",
              "200": "#e4d9ce",
              "300": "#dbccbc",
              "400": "#d1beaa",
              "500": "#c7b098",
              "600": "#a4917d",
              "700": "#817263",
              "800": "#5f5448",
              "900": "#3c352e",
              "foreground": "#000",
              "DEFAULT": "#c7b098"
            },
            "primary": {
              "50": "#faf5ef",
              "100": "#f3e6da",
              "200": "#ecd8c4",
              "300": "#e5c9ae",
              "400": "#debb98",
              "500": "#d7ac82",
              "600": "#b18e6b",
              "700": "#8c7055",
              "800": "#66523e",
              "900": "#413427",
              "foreground": "#000",
              "DEFAULT": "#d7ac82"
            },
            "secondary": {
              "50": "#f0f8f7",
              "100": "#dceeec",
              "200": "#c7e4e0",
              "300": "#b3dbd5",
              "400": "#9ed1c9",
              "500": "#8ac7be",
              "600": "#72a49d",
              "700": "#5a817c",
              "800": "#425f5a",
              "900": "#293c39",
              "foreground": "#000",
              "DEFAULT": "#8ac7be"
            },
            "success": {
              "50": "#f2f9f4",
              "100": "#e1f1e5",
              "200": "#cfe9d6",
              "300": "#bde0c7",
              "400": "#acd8b8",
              "500": "#9ad0a9",
              "600": "#7fac8b",
              "700": "#64876e",
              "800": "#496350",
              "900": "#2e3e33",
              "foreground": "#000",
              "DEFAULT": "#9ad0a9"
            },
            "warning": {
              "50": "#fffbeb",
              "100": "#fff5cf",
              "200": "#fff0b3",
              "300": "#ffea98",
              "400": "#ffe57c",
              "500": "#ffdf60",
              "600": "#d2b84f",
              "700": "#a6913e",
              "800": "#796a2e",
              "900": "#4d431d",
              "foreground": "#000",
              "DEFAULT": "#ffdf60"
            },
            "danger": {
              "50": "#fef3f1",
              "100": "#fde2dd",
              "200": "#fcd1ca",
              "300": "#fac0b6",
              "400": "#f9afa3",
              "500": "#f89e8f",
              "600": "#cd8276",
              "700": "#a1675d",
              "800": "#764b44",
              "900": "#4a2f2b",
              "foreground": "#000",
              "DEFAULT": "#f89e8f"
            },
            "background": "#faf9f8",
            "foreground": "#5c4033",
            "content1": {
              "DEFAULT": "#fcf2e9",
              "foreground": "#000"
            },
            "content2": {
              "DEFAULT": "#f9e9d3",
              "foreground": "#000"
            },
            "content3": {
              "DEFAULT": "#f6e0bd",
              "foreground": "#000"
            },
            "content4": {
              "DEFAULT": "#f3d7a7",
              "foreground": "#000"
            },
            "focus": "#d7ac82",
            "overlay": "#00000080"
          }
        },
        "dark": {
          "colors": {
            "default": {
              "50": "#131211",
              "100": "#262422",
              "200": "#393634",
              "300": "#4c4845",
              "400": "#5f5a56",
              "500": "#7f7b78",
              "600": "#9f9c9a",
              "700": "#bfbdbb",
              "800": "#dfdedd",
              "900": "#ffffff",
              "foreground": "#fff",
              "DEFAULT": "#5f5a56"
            },
            "primary": {
              "50": "#2c2723",
              "100": "#463e37",
              "200": "#60554b",
              "300": "#7a6b5f",
              "400": "#948273",
              "500": "#a7988c",
              "600": "#b9aea4",
              "700": "#ccc4bd",
              "800": "#dfdad5",
              "900": "#f2efee",
              "foreground": "#000",
              "DEFAULT": "#948273"
            },
            "secondary": {
              "50": "#283130",
              "100": "#3f4e4c",
              "200": "#566b67",
              "300": "#6e8783",
              "400": "#85a49f",
              "500": "#9ab4b0",
              "600": "#b0c4c1",
              "700": "#c5d4d1",
              "800": "#dae4e2",
              "900": "#f0f4f3",
              "foreground": "#000",
              "DEFAULT": "#85a49f"
            },
            "success": {
              "50": "#29332c",
              "100": "#415046",
              "200": "#596e60",
              "300": "#718b79",
              "400": "#89a993",
              "500": "#9eb8a6",
              "600": "#b2c7b9",
              "700": "#c7d6cc",
              "800": "#dce5df",
              "900": "#f0f4f2",
              "foreground": "#000",
              "DEFAULT": "#89a993"
            },
            "warning": {
              "50": "#35321d",
              "100": "#534f2e",
              "200": "#726d3e",
              "300": "#908a4f",
              "400": "#afa760",
              "500": "#bdb67c",
              "600": "#cbc698",
              "700": "#d9d5b3",
              "800": "#e7e5cf",
              "900": "#f5f4eb",
              "foreground": "#000",
              "DEFAULT": "#afa760"
            },
            "danger": {
              "50": "#352425",
              "100": "#54393a",
              "200": "#724e50",
              "300": "#916365",
              "400": "#b0787b",
              "500": "#be9092",
              "600": "#cca7a9",
              "700": "#d9bfc0",
              "800": "#e7d7d7",
              "900": "#f5eeef",
              "foreground": "#000",
              "DEFAULT": "#b0787b"
            },
            "background": "#0e0c0b",
            "foreground": "#e8d6c6",
            "content1": {
              "DEFAULT": "#28221f",
              "foreground": "#fff"
            },
            "content2": {
              "DEFAULT": "#3b342f",
              "foreground": "#fff"
            },
            "content3": {
              "DEFAULT": "#4e463f",
              "foreground": "#fff"
            },
            "content4": {
              "DEFAULT": "#61584f",
              "foreground": "#fff"
            },
            "focus": "#e0a864",
            "overlay": "#ffffff80"
          }
        }
      },
      layout: {
        disabledOpacity: "0.5"
      }

    }),],
}


