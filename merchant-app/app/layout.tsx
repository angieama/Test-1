import type { Metadata, Viewport } from 'next';
import './globals.css';
import './mobile.css';
export const metadata: Metadata = {
 title:'Lipa Verify | Merchant payments',description:'Find the payment. Confirm the customer. Keep moving.',
 other:{'apple-mobile-web-app-capable':'yes'},applicationName:'Lipa Verify',manifest:'/manifest.webmanifest',
 appleWebApp:{capable:true,title:'Lipa Verify',statusBarStyle:'default'},
 icons:{icon:'/favicon.svg',apple:'/icons/apple-touch-icon.png'},formatDetection:{telephone:false},
};
export const viewport: Viewport = {width:'device-width',initialScale:1,viewportFit:'cover',themeColor:'#0c7045'};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>) {return <html lang="en"><body>{children}</body></html>;}
