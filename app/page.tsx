import MapView from '../components/MapView';
import ThemeControl from '../components/ThemeControl';

export default function Home() {
  return <>
    <a className="skip-link" href="#map-workspace">지도 작업 공간으로 건너뛰기</a>
    <header className="app-header">
      <div className="app-brand"><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M12 2 22 12 12 22 2 12Z" fill="currentColor"/></svg><h1>태안군 지도</h1></div>
      <nav aria-label="현재 서비스"><span aria-current="page">지도</span><a href="/downloads">다운로드</a></nav>
      <ThemeControl/>
    </header>
    <main id="map-workspace" tabIndex={-1}><MapView/></main>
  </>;
}
