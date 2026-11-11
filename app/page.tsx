import MapView from '../components/MapView';

export default function Home() {
  return <>
    <header><h1>태안군 지도</h1><p>오프라인 TPK · EPSG:3857</p></header>
    <main><MapView /></main>
  </>;
}
