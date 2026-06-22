# PowerShell script to setup database
Write-Host "Setting up database..." -ForegroundColor Green
$password = Read-Host "Enter MySQL root password" -AsSecureString
$BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
$plainPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)

Get-Content database\init.sql | mysql -u root -p$plainPassword





