from django.contrib import admin
from .models import Student, Event, Participation

@admin.register(Student)
class StudentAdmin(admin.ModelAdmin):
    list_display = ('full_name', 'group')
    search_fields = ('full_name', 'group')
    list_filter = ('group',)

@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = ('name', 'level', 'start_date', 'end_date', 'is_first_time')
    list_filter = ('level', 'start_date', 'is_first_time')
    search_fields = ('name',)

@admin.register(Participation)
class ParticipationAdmin(admin.ModelAdmin):
    list_display = ('student', 'event', 'role', 'hours')
    list_filter = ('event', 'student')
    search_fields = ('student__full_name', 'event__name', 'role')