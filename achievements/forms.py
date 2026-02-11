from django import forms

class UploadFileForm(forms.Form):
    file = forms.FileField(label='Выберите файл Excel (.xlsx)')

from .models import Student

class ReportForm(forms.Form):
    student = forms.ModelChoiceField(queryset=Student.objects.all(), label='Студент')
    date_from = forms.DateField(label='Дата с', widget=forms.DateInput(attrs={'type': 'date'}))
    date_to = forms.DateField(label='Дата по', widget=forms.DateInput(attrs={'type': 'date'}))