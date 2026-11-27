import type {Metadata} from 'next';
import DownloadManager from '../../components/DownloadManager';
import ThemeControl from '../../components/ThemeControl';
export const metadata:Metadata={title:'지도 다운로드·관리'};
export default function Downloads(){return <><a className="skip-link" href="#download-workspace">다운로드 작업 공간으로 건너뛰기</a><header className="app-header"><div className="app-brand"><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M12 2 22 12 12 22 2 12Z" fill="currentColor"/></svg><h1>지도 데이터</h1></div><nav aria-label="현재 서비스"><a href="/">지도</a><span aria-current="page">다운로드</span></nav><ThemeControl/></header><main id="download-workspace" tabIndex={-1}><DownloadManager/></main></>;}
