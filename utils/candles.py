from dash import Dash, dcc, html, Input, Output
import plotly.graph_objects as go
import pandas as pd
import sys

# Get the CSV file path from command line arguments
if len(sys.argv) > 1:
    csv_file_path = sys.argv[1]
else:
    print("Error: Please provide a CSV file path as the first argument")
    print("Usage: python your_script.py path/to/your/file.csv")
    sys.exit(1)

app = Dash(__name__)

app.layout = html.Div([
    html.H4('Stock candlestick chart'),
    dcc.Checklist(
        id='toggle-rangeslider',
        options=[{'label': 'Include Rangeslider',
                  'value': 'slider'}],
        value=['slider']
    ),
    dcc.Graph(id="graph"),
])


@app.callback(
    Output("graph", "figure"),
    Input("toggle-rangeslider", "value"))
def display_candlestick(value):
    # Read the CSV file from the provided path
    try:
        df = pd.read_csv(csv_file_path)
        
        # Check if the required columns exist
        required_columns = ['timestamp', 'open_price_token_usd', 'high_price_token_usd', 'low_price_token_usd', 'close_price_token_usd']
        missing_columns = [col for col in required_columns if col not in df.columns]
        
        if missing_columns:
            print(f"Error: CSV file is missing required columns: {', '.join(missing_columns)}")
            print(f"Available columns: {', '.join(df.columns)}")
            return go.Figure()
        
        fig = go.Figure(go.Candlestick(
            x=df['timestamp'],
            open=df['open_price_token_usd'],
            high=df['high_price_token_usd'],
            low=df['low_price_token_usd'],
            close=df['close_price_token_usd']
        ))

        fig.update_layout(
            xaxis_rangeslider_visible='slider' in value,
            xaxis=dict(
                #type='category',  # Treat x values as discrete categories
                categoryorder='array',
                categoryarray=df['timestamp']  # Preserve the order from your data
            ),
            height=600,  # Increase the height of the chart (default is 450)
            margin=dict(l=50, r=50, t=50, b=50),  # Adjust margins as needed
            yaxis=dict(
                autorange=True,
                fixedrange=False,  # Allow y-axis zooming
            )
        )

        return fig
    except Exception as e:
        print(f"Error reading or processing CSV file: {e}")
        return go.Figure()


if __name__ == '__main__':
    app.run(debug=True)
