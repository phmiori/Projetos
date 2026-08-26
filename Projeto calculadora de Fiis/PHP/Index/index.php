<?php
/**
 * PHP/Index/index.php
 * Endpoint do Backend para o Dashboard Inicial (FinanceHub)
 * Retorna dados consolidados e métricas dos KPIs via JSON
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

try {
    // Simulação inicial de payload para integração assíncrona futura
    $dashboardData = [
        'status' => 'success',
        'timestamp' => date('c'),
        'usuario' => [
            'nome' => 'Usuário',
            'status' => 'ativo'
        ],
        'kpis' => [
            'saldo_total' => 48750.00,
            'a_pagar_hoje' => 1250.00,
            'a_receber_mes' => 8900.00
        ],
        'modulos' => [
            ['id' => 'visao-geral', 'nome' => 'Visão Geral', 'ativo' => true],
            ['id' => 'contas-pagar', 'nome' => 'Contas a Pagar', 'pendencias' => 2],
            ['id' => 'contas-receber', 'nome' => 'Contas a Receber', 'previsoes' => 5],
            ['id' => 'investimentos', 'nome' => 'Investimentos', 'posicao' => 18450.00],
            ['id' => 'fluxo-caixa', 'nome' => 'Fluxo de Caixa', 'status' => 'positivo'],
            ['id' => 'relatorios', 'nome' => 'Relatórios', 'disponiveis' => 4]
        ]
    ];

    echo json_encode($dashboardData, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'mensagem' => 'Erro interno ao processar requisição do dashboard.'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}
