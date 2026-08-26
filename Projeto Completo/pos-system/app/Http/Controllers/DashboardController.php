<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\Expense;
use Illuminate\Http\Request;
use Carbon\Carbon;

class DashboardController extends Controller
{
    public function __construct()
    {
        $this->middleware('auth:sanctum');
    }

    public function index()
    {
        $totalCustomers = Customer::count();
        $totalExpenses = Expense::sum('amount');
        
        $currentMonthExpenses = Expense::whereMonth('date', Carbon::now()->month)
                                       ->whereYear('date', Carbon::now()->year)
                                       ->sum('amount');

        $recentExpenses = Expense::latest('date')->take(5)->get();

        return response()->json([
            'total_customers' => $totalCustomers,
            'total_expenses' => $totalExpenses,
            'current_month_expenses' => $currentMonthExpenses,
            'recent_expenses' => $recentExpenses
        ]);
    }
}
