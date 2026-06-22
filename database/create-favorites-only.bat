@echo off
echo ========================================
echo Creating favorites table...
echo ========================================
echo.
echo Please enter your MySQL root password when prompted.
echo.
mysql -u root -p event_registration_db < quick-fix-favorites.sql
echo.
echo ========================================
echo Done! The favorites table should now exist.
echo ========================================
pause




