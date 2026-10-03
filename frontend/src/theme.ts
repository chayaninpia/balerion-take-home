import { createTheme } from '@mui/material/styles'

export const theme = createTheme({
  cssVariables: true,
  modularCssLayers: true,
  palette: {
    primary: { main: '#1a73e8' },
    secondary: { main: '#7627bb' },
    error: { main: '#d93025' },
    warning: { main: '#b06000' },
    success: { main: '#137333' },
    background: { default: '#f8f9fa', paper: '#ffffff' },
    text: { primary: '#202124', secondary: '#5f6368' },
    divider: '#dadce0',
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: 'Roboto, Arial, Helvetica, sans-serif',
    button: { textTransform: 'none', fontWeight: 500 },
  },
})
