import type { Metadata } from 'next';
import 'leaflet/dist/leaflet.css';
import './globals.css';
import {themeBootstrap} from '../lib/theme';

export const metadata: Metadata = {
  title: '태안군 지도',
  description: 'OSM 일반 지도·TPK 위성영상·DEM 고도 지도'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Only this root attribute is set before hydration by the static theme bootstrap.
  return <html lang="ko" suppressHydrationWarning><head>
    <meta name="theme-color" content="#172b4d"/>
    <script dangerouslySetInnerHTML={{__html: themeBootstrap}}/>
  </head><body>{children}</body></html>;
}
