$files = @(
  'd:\EVENTS\backend\controllers\admin\adminController.js',
  'd:\EVENTS\backend\controllers\bookingController.js',
  'd:\EVENTS\backend\controllers\eventController.js',
  'd:\EVENTS\backend\controllers\notebookController.js',
  'd:\EVENTS\backend\controllers\venueOwnerController.js',
  'd:\EVENTS\backend\controllers\workshopCheckinController.js',
  'd:\EVENTS\backend\controllers\workshopController.js',
  'd:\EVENTS\backend\controllers\workshopFileController.js',
  'd:\EVENTS\backend\controllers\workshopNotificationController.js',
  'd:\EVENTS\backend\controllers\workshopProgressController.js',
  'd:\EVENTS\backend\controllers\walletController.js',
  'd:\EVENTS\backend\controllers\venueController.js',
  'd:\EVENTS\backend\controllers\profileController.js',
  'd:\EVENTS\backend\controllers\paymentController.js',
  'd:\EVENTS\backend\controllers\chatController.js',
  'd:\EVENTS\backend\controllers\directChatController.js',
  'd:\EVENTS\backend\controllers\workshopCalendarController.js',
  'd:\EVENTS\backend\controllers\workshopActivityController.js',
  'd:\EVENTS\backend\controllers\workshopChatController.js',
  'd:\EVENTS\backend\controllers\notebookPredictionController.js'
)

foreach ($f in $files) {
  if (Test-Path $f) {
    $c = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)
    $orig = $c
    # Replace: { success: false, message: with { success: false, error:
    $c = [System.Text.RegularExpressions.Regex]::Replace($c, '(success:\s*false,\s*)message:', '$1error:')
    if ($c -ne $orig) {
      [System.IO.File]::WriteAllText($f, $c, [System.Text.Encoding]::UTF8)
      Write-Host "UPDATED: $f"
    } else {
      Write-Host "NO CHANGE: $f"
    }
  } else {
    Write-Host "MISSING: $f"
  }
}
Write-Host "Done."
