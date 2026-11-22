/** Read-only organization discovery. Stdout contains only an official portal URL. */
class SetupError extends Error {}
try {
  if (process.argv.length !== 2) throw new SetupError('node --env-file=.env.downloads scripts/arcgis-organization.mjs 로 실행하세요.');
  const token=process.env.ARCGIS_TOKEN;
  if (!token || token.length>16384 || /\s/.test(token)) throw new SetupError('현재 실행 환경의 ARCGIS_TOKEN을 확인하세요.');
  const headers={Authorization:'Bearer '+token},referer=process.env.ARCGIS_REFERER;
  if(referer){
    const u=new URL(referer);
    if(referer.length>2048 || /[^\x21-\x7e]/.test(referer) || u.username || u.password || u.search || u.hash || !(u.protocol==='https:' || u.protocol==='http:' && ['localhost','127.0.0.1'].includes(u.hostname)))throw new SetupError('ARCGIS_REFERER 설정을 확인하세요.');
    headers.Referer=referer;
  }
  const response=await fetch('https://www.arcgis.com/sharing/rest/portals/self?f=json',{
    headers,redirect:'error',signal:AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new SetupError('조직 조회 HTTP 오류: '+response.status);
  let size=0;const chunks=[];
  for await(const chunk of response.body){size+=chunk.length;if(size>1024*1024)throw new SetupError('조직 조회 응답 크기 한도 초과');chunks.push(Buffer.from(chunk));}
  const result=JSON.parse(Buffer.concat(chunks).toString());
  if (result.error) throw new SetupError('조직 조회 인증 오류: '+(Number.isInteger(result.error.code)?result.error.code:'unknown'));
  if (!result.user?.orgId || !/^[a-z0-9][a-z0-9-]{0,62}$/i.test(result.urlKey||'') || !['maps.arcgis.com','arcgis.com'].includes(result.customBaseUrl)) throw new SetupError('지원하는 ArcGIS Online 조직 주소를 확인할 수 없습니다. 로그인한 조직의 URL을 확인하세요.');
  process.stdout.write('https://'+result.urlKey+'.'+result.customBaseUrl+'\n');
} catch(error) {
  console.error(error instanceof SetupError?error.message:'조직 조회 연결 또는 응답을 확인하지 못했습니다. 토큰 값 없이 오류 상황을 확인하세요.');
  process.exitCode=1;
}
