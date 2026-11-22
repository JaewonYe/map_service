# ArcGIS Online 조직·Referer 토큰 로그인 (Windows PowerShell)

계정 API 인증/조직 소속은 정상인데 World Imagery가498을 반환할 때 사용할 수 있는 공식 인증 절차다. [Esri World Imagery export 안내](https://support.esri.com/en-us/knowledge-base/problem-unable-to-export-a-tile-package-from-the-world--000014855)의 조직 URL/Referer 조건에 맞춘다. 새 토큰의 실제 서비스 응답으로 확인해야 하며 원인이 Referer였다고 미리 단정하지 않는다. 계정의 해당 서비스 이용·오프라인 표시/이전 권한은 그대로 적용되고 추가 권한을 생성하지 않는다.

Docker Desktop과 최신 map_service를 준비하고 프로젝트 폴더의 **같은 PowerShell 창**에서 아래 블록을 실행한다. 기존 `.env.downloads`와 data는 유지한다. 조직 URL은 현재 토큰으로 [Portal Self API](https://developers.arcgis.com/rest/users-groups-and-items/portal-self/)에서 알아내며 stdout에는 공식 조직 URL만 출력한다. 기존 토큰이 만료됐거나 자동 확인이 안 되면 브라우저에서 로그인한 조직의 URL을 입력한다. 이 절차는 ArcGIS Online의 `*.maps.arcgis.com`/`*.arcgis.com` 조직만 지원한다.

```powershell
$arcOrgUrl = node --env-file=.env.downloads scripts/arcgis-organization.mjs
if ($LASTEXITCODE -ne 0) {
    $arcOrgUrl = Read-Host "로그인한 ArcGIS 조직 주소 (https://조직이름.maps.arcgis.com)"
}
$arcOrgUrl = "$arcOrgUrl".Trim().TrimEnd('/')
if ($arcOrgUrl -notmatch '^https://[a-z0-9][a-z0-9-]{0,62}\.(maps\.)?arcgis\.com$') {
    throw "공식 ArcGIS Online 조직 주소를 확인하세요. 비밀번호는 입력하지 않았습니다."
}
Write-Host "로그인 대상: $arcOrgUrl"
$arcReferer = "https://www.arcgis.com"
$arcLogin = Get-Credential -Message "ArcGIS Online 아이디와 비밀번호"
try {
    $arcReply = Invoke-RestMethod -Method Post -Uri "$arcOrgUrl/sharing/rest/generateToken" -Body @{
        f = "json"
        username = $arcLogin.UserName
        password = $arcLogin.GetNetworkCredential().Password
        client = "referer"
        referer = $arcReferer
        expiration = "60"
    } -ErrorAction Stop
    if (-not $arcReply.token) {
        throw "토큰 발급 실패. 오류 코드: $($arcReply.error.code)"
    }
    $env:ARCGIS_TOKEN = $arcReply.token
    $env:ARCGIS_REFERER = $arcReferer
    $arcCheck = Invoke-RestMethod -Method Get -Uri "https://tiledbasemaps.arcgis.com/arcgis/rest/services/World_Imagery/MapServer?f=json" -Headers @{
        Authorization = "Bearer $env:ARCGIS_TOKEN"
        Referer = $env:ARCGIS_REFERER
    } -ErrorAction Stop
    [pscustomobject]@{tokenIssued=$true; errorCode=$arcCheck.error.code; exportTilesAllowed=$arcCheck.exportTilesAllowed}
}
finally {
    Remove-Variable arcLogin, arcReply, arcCheck, arcReferer -ErrorAction SilentlyContinue
}
```

아이디/비밀번호는 Get-Credential 입력창에만 입력한다. 비밀번호는 공식 조직 HTTPS POST 본문에 사용하고 코드/파일/URL에 저장하지 않는다. 토큰은 현재 PowerShell의 ARCGIS_TOKEN, 발급 시 Referer는 ARCGIS_REFERER에 설정된다. 창을 닫거나 다른 창을 사용하면 이 설정이 전달되지 않는다. 새 토큰을 파일에 수동 저장하려면 Git/Docker에서 제외된 로컬 `.env.downloads`에 두 값을 함께 설정하며 채팅에는 보내지 않는다. Node env-file보다 현재 프로세스의 환경변수가 우선한다.

`tokenIssued=True`만으로 위성 권한 성공을 판정하지 않는다. `errorCode`가 비어 있고 **exportTilesAllowed=True**인지 확인한다. 계속498이면 조직 담당자/Esri에 해당 서비스의 토큰 발급 조건·계정/서비스 상태 확인이 필요하다. 이때 코드와 조건만 전달하고 실제 토큰/비밀번호를 보내지 않는다. 403은 별도 권한 거부로 확인한다. 정상화 전 전체 다운로드를 반복하지 않아도 된다.

서비스 확인이 성공하고 해당 앱의 이용 범위를 확인했다면 같은 창에서 실행한다.

```powershell
node --env-file=.env.downloads scripts/download-taean.mjs --accept-usage
```

worker는 Referer를 tiledbasemaps.arcgis.com 요청에만 추가한다. 다른 제공처/그쪽으로의 redirect에는 보내지 않고 Referer URL을 새 manifest에 기록하지 않는다. 비어 있으면 기존 token 동작을 유지한다. 새 토큰은 client=referer로 발급되므로 이전 client=requestip 토큰에 헤더만 추가한 검사와 다르다. 위성 원본의 실제 export/TPK 검사/표시 확인은 다운로드 작업 결과로 계속 검증한다. 기존 고도 원본/ZIP은 유지하고 `--refresh` 없이 재사용한다.
