from django.db import models
from django.core.validators import MinValueValidator

class Student(models.Model):
    """Студент / волонтёр"""
    full_name = models.CharField(max_length=200, verbose_name="ФИО")
    group = models.CharField(max_length=50, verbose_name="Группа (курс)", blank=True, default="")

    def __str__(self):
        return f"{self.full_name} ({self.group})" if self.group else self.full_name

    class Meta:
        verbose_name = "Студент"
        verbose_name_plural = "Студенты"


class Event(models.Model):
    """Мероприятие"""
    LEVEL_CHOICES = [
        ('faculty', 'Факультетский'),
        ('course', 'Курсовой'),
        ('university', 'Университетский/межфакультетский'),
        ('interuniversity', 'Межуниверситетский/региональный'),
        ('all_russian', 'Всероссийский/межрегиональный'),
        ('chemistry_day', 'День химика'),
        ('cabbage', 'Капустник'),
        ('dedication', 'Посвящение в химики'),
    ]

    name = models.CharField(max_length=300, verbose_name="Название")
    level = models.CharField(max_length=30, choices=LEVEL_CHOICES, verbose_name="Уровень")
    start_date = models.DateField(verbose_name="Дата начала")
    end_date = models.DateField(verbose_name="Дата окончания")
    is_first_time = models.BooleanField(default=False, verbose_name="Организовано впервые?")

    def __str__(self):
        return f"{self.name} ({self.get_level_display()}, {self.start_date} - {self.end_date})"

    class Meta:
        verbose_name = "Мероприятие"
        verbose_name_plural = "Мероприятия"


class Participation(models.Model):
    """Участие студента в мероприятии"""
    student = models.ForeignKey(Student, on_delete=models.CASCADE, verbose_name="Студент")
    event = models.ForeignKey(Event, on_delete=models.CASCADE, verbose_name="Мероприятие")
    role = models.CharField(max_length=200, verbose_name="Роль", blank=True, default="")
    hours = models.PositiveIntegerField(verbose_name="Часы", validators=[MinValueValidator(1)])

    def __str__(self):
        return f"{self.student} - {self.event} ({self.hours} ч.)"

    class Meta:
        verbose_name = "Участие"
        verbose_name_plural = "Участия"
        unique_together = ('student', 'event')