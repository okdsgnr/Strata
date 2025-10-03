// tailwind.config.js
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./app/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Core backgrounds
        night: "#0B0C14",
        surface: "#12131C",
        brand: "#00BFA6",
        
        // Tier colors
        tier: {
          whale: "#7C3AED",
          shark: "#2563EB", 
          dolphin: "#22C55E",
          fish: "#14B8A6",
          shrimp: "#EF4444",
        },

        // Legacy colors (keeping for compatibility)
        navy: {
          900: "#0A0B1A",
          800: "#1C1F2E", 
          700: "#2E3350",
        },
        cyan: {
          500: "#1FA6A6",
        },
        blue: {
          600: "#49587C",
        },
        neutral: {
          50: "#F6F7F9",
          100: "#EAEFF3",
          200: "#C7CBD1",
        },
        green: {
          500: "#3DDC97",
        },
        red: {
          500: "#E05252",
        },
      },

      fontFamily: {
        // Force everything to Geist Mono; remap legacy families to it
        sans: ["Geist Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        mono: ["Geist Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        satoshi: ["Geist Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        ibmplex: ["Geist Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },

      boxShadow: {
        lg: "0 4px 12px rgba(0,0,0,0.4)",
      },

      borderRadius: {
        xl: "1rem",
        "2xl": "1.5rem",
      },
    },
  },
  plugins: [],
}
