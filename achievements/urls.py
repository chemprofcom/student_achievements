from django.urls import path
from . import views

urlpatterns = [
    path('upload/', views.upload_participations, name='upload'),
    path('report/', views.student_report, name='report'),
]