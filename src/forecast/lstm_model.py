import torch
import torch.nn as nn

class LSTMForecaster(nn.Module):
    """LSTM model for multi-task solar flare forecasting.
    
    Inputs: Sequence of raw X-ray values (soft, hard) over a historic window.
    Outputs: Binary logits for multiple future forecast horizons (e.g., 15m, 30m).
    """
    def __init__(self, input_dim=2, hidden_dim=64, num_layers=2, output_dim=2):
        super().__init__()
        self.hidden_dim = hidden_dim
        self.num_layers = num_layers
        
        self.lstm = nn.LSTM(
            input_size=input_dim,
            hidden_size=hidden_dim,
            num_layers=num_layers,
            batch_first=True,
            dropout=0.2 if num_layers > 1 else 0.0
        )
        # Multi-task head outputs logits for each target horizon
        self.fc = nn.Linear(hidden_dim, output_dim)
        
    def forward(self, x):
        # x shape: (batch_size, seq_len, input_dim)
        lstm_out, _ = self.lstm(x)
        
        # Extract features from the last sequence step
        last_step = lstm_out[:, -1, :] # shape: (batch_size, hidden_dim)
        
        # Map to outputs
        logits = self.fc(last_step) # shape: (batch_size, output_dim)
        return logits
