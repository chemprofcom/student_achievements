"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse
from django.conf import settings
import os
import json
import time

#region agent log
def debug_static_info(request):
    """Debug endpoint to check static file serving configuration"""
    log_path = settings.BASE_DIR / "debug-7459a2.log"
    try:
        # Test WhiteNoise file serving
        admin_css_path = os.path.join(settings.STATIC_ROOT, 'admin', 'css', 'base.css')
        manifest_path = os.path.join(settings.STATIC_ROOT, 'staticfiles.json')
        
        data = {
            "STATIC_ROOT": str(settings.STATIC_ROOT),
            "STATIC_URL": settings.STATIC_URL,
            "static_root_exists": os.path.isdir(settings.STATIC_ROOT),
            "admin_css_exists": os.path.isfile(admin_css_path),
            "manifest_exists": os.path.isfile(manifest_path),
            "DEBUG": settings.DEBUG,
            "storage_class": settings.STATICFILES_STORAGE,
        }
        
        # Log to file
        payload = {
            "sessionId": "7459a2",
            "runId": "pre-fix",
            "hypothesisId": "H8",
            "location": "config/urls.py:debug_static_info",
            "message": "WhiteNoise serving test endpoint",
            "data": data,
            "timestamp": int(time.time() * 1000),
        }
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(payload, ensure_ascii=False) + "\n")
        
        return JsonResponse(data)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)
#endregion agent log

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', include('achievements.urls')),
    path('debug-static/', debug_static_info, name='debug_static'),
]
